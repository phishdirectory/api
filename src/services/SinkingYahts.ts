import { rawAPIData, domains } from "src/db/schema";
import { headersWithSinkingYahts } from "src/defs/headers";
import { getDbDomain } from "src/func/db/domain";
import { axios } from "src/utils/axios";
import { db } from "src/utils/db";
import { sanitizeDomain } from "src/utils/sanitizeDomain";
import { eq } from "drizzle-orm";
import WebSocket from "ws";
import { info, warn, error } from "src/utils/logger";

interface SinkingYachtsDomain {
  domain: string;
  date_added: string;
  date_updated?: string;
}

interface WebSocketMessage {
  action: "add" | "remove" | "update";
  domain: string;
  date: string;
}

/**
 * A service that provides access to the SinkingYahts service for checking and reporting domains.
 */
export class SinkingYahtsService {
  private wsConnection: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000; // 5 seconds

  domain = {
    /**
     * Asynchronously checks a given domain against the SinkingYahts service for any known bad domains.
     *
     * @param {string} domain - The domain name to be checked.
     * @returns
     */
    check: async (domain: string) => {
      // metrics.increment("services.sinkingyahts.domain.check");
      const sanitizedDomain = sanitizeDomain(domain);

      const response = await axios.get<boolean>(
        `https://phish.sinking.yachts/v2/check/${sanitizedDomain}`,
        {
          headers: headersWithSinkingYahts,
        }
      );

      const data = response.data;
      const dbDomain = await getDbDomain(sanitizedDomain);

      await db.insert(rawAPIData).values({
        sourceAPI: "SinkingYachts",
        domain: dbDomain!.id!,
        data: data,
      });

      return data;
    },
  };

  /**
   * Fetches all domains from the SinkingYachts API
   */
  async getAllDomains(): Promise<SinkingYachtsDomain[]> {
    try {
      const response = await axios.get<SinkingYachtsDomain[]>(
        "https://phish.sinking.yachts/v2/all",
        {
          headers: headersWithSinkingYahts,
        }
      );

      info(`SinkingYachts: Fetched ${response.data.length} domains from /v2/all`);
      return response.data;
    } catch (err: any) {
      error(`SinkingYachts: Failed to fetch all domains: ${err.message}`);
      throw err;
    }
  }

  /**
   * Fetches recent domains from the SinkingYachts API since a given date
   * @param since - ISO date string for filtering recent domains
   */
  async getRecentDomains(since: string): Promise<SinkingYachtsDomain[]> {
    try {
      const response = await axios.get<SinkingYachtsDomain[]>(
        `https://phish.sinking.yachts/v2/recent/${since}`,
        {
          headers: headersWithSinkingYahts,
        }
      );

      info(`SinkingYachts: Fetched ${response.data.length} recent domains since ${since}`);
      return response.data;
    } catch (err: any) {
      error(`SinkingYachts: Failed to fetch recent domains: ${err.message}`);
      throw err;
    }
  }

  /**
   * Processes domain data and stores it in the database
   */
  private async processDomainData(domainData: SinkingYachtsDomain[], isUpdate = false): Promise<void> {
    for (const item of domainData) {
      try {
        const sanitizedDomain = sanitizeDomain(item.domain);
        let dbDomain = await getDbDomain(sanitizedDomain);

        if (!dbDomain) {
          const [insertedDomain] = await db.insert(domains).values({
            domain: sanitizedDomain,
            malicious: true,
          }).returning();
          dbDomain = insertedDomain;
          info(`SinkingYachts: Added new malicious domain: ${sanitizedDomain}`);
        } else if (isUpdate) {
          await db.update(domains)
            .set({ 
              malicious: true, 
              last_checked: new Date(),
              updated_at: new Date()
            })
            .where(eq(domains.id, dbDomain.id));
          info(`SinkingYachts: Updated domain: ${sanitizedDomain}`);
        }

        await db.insert(rawAPIData).values({
          sourceAPI: "SinkingYachts",
          domain: dbDomain.id,
          data: item,
        });

      } catch (err: any) {
        warn(`SinkingYachts: Failed to process domain ${item.domain}: ${err.message}`);
      }
    }
  }

  /**
   * Initializes the bulk import of all domains from SinkingYachts
   */
  async initializeBulkImport(): Promise<void> {
    try {
      info("SinkingYachts: Starting bulk import of all domains...");
      const allDomains = await this.getAllDomains();
      await this.processDomainData(allDomains, false);
      info(`SinkingYachts: Bulk import completed. Processed ${allDomains.length} domains.`);
    } catch (err: any) {
      error(`SinkingYachts: Bulk import failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Starts the WebSocket connection for real-time updates
   */
  startRealtimeFeed(): void {
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      warn("SinkingYachts: WebSocket connection already active");
      return;
    }

    try {
      this.wsConnection = new WebSocket("wss://phish.sinking.yachts/feed", {
        headers: {
          "X-Identity": headersWithSinkingYahts["X-Identity"],
        },
      });

      this.wsConnection.on("open", () => {
        info("SinkingYachts: WebSocket connection established");
        this.reconnectAttempts = 0;
      });

      this.wsConnection.on("message", async (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          await this.handleWebSocketMessage(message);
        } catch (err: any) {
          warn(`SinkingYachts: Failed to parse WebSocket message: ${err.message}`);
        }
      });

      this.wsConnection.on("close", (code: number, reason: Buffer) => {
        warn(`SinkingYachts: WebSocket connection closed (${code}: ${reason.toString()})`);
        this.attemptReconnect();
      });

      this.wsConnection.on("error", (err: Error) => {
        error(`SinkingYachts: WebSocket error: ${err.message}`);
      });

    } catch (err: any) {
      error(`SinkingYachts: Failed to start WebSocket connection: ${err.message}`);
      this.attemptReconnect();
    }
  }

  /**
   * Handles incoming WebSocket messages
   */
  private async handleWebSocketMessage(message: WebSocketMessage): Promise<void> {
    try {
      const sanitizedDomain = sanitizeDomain(message.domain);
      
      switch (message.action) {
        case "add":
          await this.handleDomainAdd(sanitizedDomain, message.date);
          break;
        case "remove":
          await this.handleDomainRemove(sanitizedDomain, message.date);
          break;
        case "update":
          await this.handleDomainUpdate(sanitizedDomain, message.date);
          break;
        default:
          warn(`SinkingYachts: Unknown WebSocket action: ${message.action}`);
      }
    } catch (err: any) {
      error(`SinkingYachts: Failed to handle WebSocket message: ${err.message}`);
    }
  }

  /**
   * Handles domain addition from WebSocket feed
   */
  private async handleDomainAdd(domain: string, date: string): Promise<void> {
    let dbDomain = await getDbDomain(domain);

    if (!dbDomain) {
      const [insertedDomain] = await db.insert(domains).values({
        domain: domain,
        malicious: true,
      }).returning();
      dbDomain = insertedDomain;
    } else {
      await db.update(domains)
        .set({ 
          malicious: true, 
          last_checked: new Date(),
          updated_at: new Date()
        })
        .where(eq(domains.id, dbDomain.id));
    }

    await db.insert(rawAPIData).values({
      sourceAPI: "SinkingYachts",
      domain: dbDomain.id,
      data: { domain, date_added: date, action: "add" },
    });

    info(`SinkingYachts: Real-time add - ${domain}`);
  }

  /**
   * Handles domain removal from WebSocket feed
   */
  private async handleDomainRemove(domain: string, date: string): Promise<void> {
    const dbDomain = await getDbDomain(domain);

    if (dbDomain) {
      await db.update(domains)
        .set({ 
          malicious: false, 
          last_checked: new Date(),
          updated_at: new Date()
        })
        .where(eq(domains.id, dbDomain.id));

      await db.insert(rawAPIData).values({
        sourceAPI: "SinkingYachts",
        domain: dbDomain.id,
        data: { domain, date_removed: date, action: "remove" },
      });

      info(`SinkingYachts: Real-time remove - ${domain}`);
    }
  }

  /**
   * Handles domain update from WebSocket feed
   */
  private async handleDomainUpdate(domain: string, date: string): Promise<void> {
    const dbDomain = await getDbDomain(domain);

    if (dbDomain) {
      await db.update(domains)
        .set({ 
          last_checked: new Date(),
          updated_at: new Date()
        })
        .where(eq(domains.id, dbDomain.id));

      await db.insert(rawAPIData).values({
        sourceAPI: "SinkingYachts",
        domain: dbDomain.id,
        data: { domain, date_updated: date, action: "update" },
      });

      info(`SinkingYachts: Real-time update - ${domain}`);
    }
  }

  /**
   * Attempts to reconnect the WebSocket connection
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      error("SinkingYachts: Max reconnection attempts reached. Giving up.");
      return;
    }

    this.reconnectAttempts++;
    warn(`SinkingYachts: Attempting to reconnect WebSocket (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms...`);

    setTimeout(() => {
      this.startRealtimeFeed();
    }, this.reconnectDelay);

    this.reconnectDelay *= 2; // Exponential backoff
  }

  /**
   * Stops the WebSocket connection
   */
  stopRealtimeFeed(): void {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
      info("SinkingYachts: WebSocket connection stopped");
    }
  }

  /**
   * Starts the complete feed monitoring service (bulk import + realtime)
   */
  async startFeedMonitoring(skipBulkImport = false): Promise<void> {
    try {
      if (!skipBulkImport) {
        await this.initializeBulkImport();
      }
      this.startRealtimeFeed();
      info("SinkingYachts: Feed monitoring service started");
    } catch (err: any) {
      error(`SinkingYachts: Failed to start feed monitoring: ${err.message}`);
      throw err;
    }
  }
}
