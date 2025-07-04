import { rawAPIData } from "src/db/schema";
import { headersWithUrlScan } from "src/defs/headers";
import { getDbDomain } from "src/func/db/domain";
import { axios } from "src/utils/axios";
import { db } from "src/utils/db";
import { sanitizeDomain } from "src/utils/sanitizeDomain";

/**
 * A service that provides access to the UrlScan service for checking and reporting domains.
 */
export class UrlScanService {
  domain = {
    /**
     * Asynchronously checks a given domain against the UrlScan service for any known bad domains.
     *
     * @param {string} domain - The domain name to be checked.
     * @returns
     */
    check: async (domain: string) => {
      // metrics.increment("services.urlscan.domain.check");
      const sanitizedDomain = sanitizeDomain(domain);

      const checkSearch = await axios.get(
        `https://urlscan.io/api/v1/search/?q=domain:${sanitizedDomain}`,
        {
          headers: headersWithUrlScan,
        }
      );

      // check if the link is not already scanned
      if (checkSearch.data.results.length === 0) {
        // if not scan the link, providing the api key
        const scan = await axios.post(
          "https://urlscan.io/api/v1/scan/",
          {
            url: domain,
            tags: ["https://phish.directory", "api.phish.directory"],
          },
          {
            headers: headersWithUrlScan,
          }
        );

        // wait 15 seconds for the scan to finish
        setTimeout(async () => {
          const scanResult = await axios.get(
            `https://urlscan.io/api/v1/result/${scan.data.uuid}/`,
            {
              headers: headersWithUrlScan,
            }
          );

          if (!scanResult.data) throw new Error("UrlScan API returned no data");
          return scanResult.data;
        }, 15000);
      } else {
        const scanResult = await axios.get(
          `https://urlscan.io/api/v1/result/${checkSearch.data.results[0].task.uuid}/`,
          {
            headers: headersWithUrlScan,
          }
        );

        const dbDomain = await getDbDomain(sanitizedDomain);

        await db.insert(rawAPIData).values({
          sourceAPI: "UrlScan",
          domain: dbDomain!.id!,
          data: scanResult.data,
        });

        return scanResult.data;
      }
    },
  };
}
