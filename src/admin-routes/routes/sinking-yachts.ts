import express, { Request, Response } from "express";
import { sinkingYahtsService } from "src/services/_index";

const router = express.Router();

/**
 * POST /admin/sinking-yachts/start-feed
 * @summary Starts the SinkingYachts realtime feed monitoring
 * @tags SinkingYachts - Feed Management
 * @security BearerAuth
 * @param {object} request.body
 * @param {boolean} request.body.skipBulkImport - Skip the initial bulk import (optional)
 * @return {object} 200 - Success response
 * @return {object} 500 - Error response
 */
router.post("/start-feed", async (req: Request, res: Response) => {
  try {
    const { skipBulkImport = false } = req.body;
    
    await sinkingYahtsService.startFeedMonitoring(skipBulkImport);
    
    return res.status(200).json({
      success: true,
      message: "SinkingYachts feed monitoring started successfully",
      skipBulkImport
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to start SinkingYachts feed monitoring",
      error: error.message
    });
  }
});

/**
 * POST /admin/sinking-yachts/stop-feed
 * @summary Stops the SinkingYachts realtime feed monitoring
 * @tags SinkingYachts - Feed Management  
 * @security BearerAuth
 * @return {object} 200 - Success response
 */
router.post("/stop-feed", async (req: Request, res: Response) => {
  try {
    sinkingYahtsService.stopRealtimeFeed();
    
    return res.status(200).json({
      success: true,
      message: "SinkingYachts feed monitoring stopped successfully"
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to stop SinkingYachts feed monitoring",
      error: error.message
    });
  }
});

/**
 * POST /admin/sinking-yachts/bulk-import
 * @summary Manually triggers a bulk import of all domains from SinkingYachts
 * @tags SinkingYachts - Feed Management
 * @security BearerAuth
 * @return {object} 200 - Success response
 * @return {object} 500 - Error response
 */
router.post("/bulk-import", async (req: Request, res: Response) => {
  try {
    await sinkingYahtsService.initializeBulkImport();
    
    return res.status(200).json({
      success: true,
      message: "SinkingYachts bulk import completed successfully"
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to complete SinkingYachts bulk import",
      error: error.message
    });
  }
});

/**
 * GET /admin/sinking-yachts/recent
 * @summary Fetches recent domains from SinkingYachts API
 * @tags SinkingYachts - Feed Management
 * @security BearerAuth
 * @param {string} since.query.required - ISO date string for filtering recent domains
 * @return {object} 200 - Array of recent domains
 * @return {object} 400 - Bad request (missing since parameter)
 * @return {object} 500 - Error response
 */
router.get("/recent", async (req: Request, res: Response) => {
  try {
    const { since } = req.query;
    
    if (!since || typeof since !== "string") {
      return res.status(400).json({
        success: false,
        message: "Missing or invalid 'since' query parameter (ISO date string required)"
      });
    }
    
    const recentDomains = await sinkingYahtsService.getRecentDomains(since);
    
    return res.status(200).json({
      success: true,
      data: recentDomains,
      count: recentDomains.length,
      since
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch recent domains",
      error: error.message
    });
  }
});

export default router;