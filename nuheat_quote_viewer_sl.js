/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 * 
 * Nu-Heat Quote Viewer Suitelet (Proxy)
 * 
 * Description: Serves the latest version of a generated quote HTML file
 * via a stable, permanent URL. This acts as a proxy between the Master
 * Proposal / customer-facing link and the timestamped HTML files in the
 * File Cabinet.
 * 
 * The URL format is:
 *   /app/site/hosting/scriptlet.nl?script=customscript_nuheat_quote_viewer&deploy=customdeploy_nuheat_quote_viewer&quote={quoteId}&opp={opportunityId}
 * 
 * This URL never changes — every time it is accessed, the Suitelet
 * searches for the latest timestamped HTML file and serves its content
 * with no-cache headers so the viewer always sees fresh data.
 * 
 * DEPLOYMENT REQUIREMENTS:
 *   - Script ID: customscript_nuheat_quote_viewer
 *   - Deployment ID: customdeploy_nuheat_quote_viewer
 *   - Status: Released
 *   - "Available Without Login": MUST be checked (critical for public access)
 *   - Audience > Roles: Select "All Roles" or ensure public access role is included
 *   - Execute As Role: Administrator (or role with file cabinet access)
 * 
 * PERMISSIONS TROUBLESHOOTING:
 *   If you see "You do not have privileges to view this page":
 *   1. Go to Customization > Scripting > Script Deployments
 *   2. Find deployment: customdeploy_nuheat_quote_viewer
 *   3. Verify "Available Without Login" is checked
 *   4. Verify Status is "Released" (not "Testing")
 *   5. Check Audience tab — ensure appropriate roles are selected
 *   6. Save the deployment record
 *   7. Clear browser cache and try the URL again
 * 
 * Author: Nu-Heat Development Team
 * Version: 1.1.0
 * Created: 28 March 2026
 * Updated: 28 March 2026
 * 
 * CHANGELOG:
 *   v1.1.0 - Enhanced diagnostic logging, added ?diag=1 mode, improved error messages
 *   v1.0.0 - Initial release
 * 
 * Dependencies:
 * - HTML files stored in File Cabinet folder: SuiteScripts > NuHeat > Quote HTML Files
 * - Filename pattern: quote_{quoteId}_{opportunityId}_{timestamp}.html
 * - Folder ID: 21719365
 */

define(['N/search', 'N/file', 'N/log', 'N/error', 'N/runtime'],
    function(search, file, log, error, runtime) {

        // =====================================================================
        // CONFIGURATION
        // =====================================================================
        var SCRIPT_VERSION = '1.1.0';
        var QUOTE_HTML_FOLDER_ID = 21719365;

        // =====================================================================
        // MAIN ENTRY POINT
        // =====================================================================

        /**
         * Handles incoming GET requests.
         * Looks up the latest HTML file for the given quote + opportunity IDs
         * and serves it directly with no-cache headers.
         * 
         * @param {Object} context - Suitelet request/response context
         */
        function onRequest(context) {
            var startTime = Date.now();

            try {
                // v1.1.0: Enhanced diagnostic logging
                var currentScript = runtime.getCurrentScript();
                var currentUser = runtime.getCurrentUser();
                
                log.audit('QuoteViewer', 'v' + SCRIPT_VERSION + ' Request received: ' + 
                    context.request.method + 
                    ' | Script: ' + currentScript.id + 
                    ' | Deploy: ' + currentScript.deploymentId +
                    ' | User: ' + currentUser.id + ' (' + currentUser.roleId + ')' +
                    ' | RemainingUsage: ' + currentScript.getRemainingUsage());

                if (context.request.method !== 'GET') {
                    throw error.create({
                        name: 'INVALID_METHOD',
                        message: 'Only GET requests are supported'
                    });
                }

                // ─── Extract parameters ──────────────────────────────────
                var quoteId = context.request.parameters.quote ||
                              context.request.parameters.quoteid ||
                              context.request.parameters.quoteId;

                var opportunityId = context.request.parameters.opp ||
                                    context.request.parameters.opportunityId || '';

                var diagMode = context.request.parameters.diag === '1';

                log.audit('QuoteViewer', 'Parameters: quote=' + quoteId + ', opp=' + opportunityId + ', diag=' + diagMode);

                // ─── Diagnostic mode ─────────────────────────────────────
                // Append ?diag=1 to URL to get diagnostic info instead of the quote
                if (diagMode) {
                    log.audit('QuoteViewer', 'DIAGNOSTIC MODE requested');
                    var diagInfo = {
                        version: SCRIPT_VERSION,
                        scriptId: currentScript.id,
                        deploymentId: currentScript.deploymentId,
                        userId: currentUser.id,
                        userRole: currentUser.roleId,
                        remainingUsage: currentScript.getRemainingUsage(),
                        folderId: QUOTE_HTML_FOLDER_ID,
                        parameters: {
                            quote: quoteId,
                            opp: opportunityId
                        },
                        timestamp: new Date().toISOString()
                    };
                    
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify(diagInfo, null, 2));
                    return;
                }

                // ─── Validate parameters ─────────────────────────────────
                if (!quoteId) {
                    log.error('QuoteViewer', 'Missing quote ID parameter');
                    context.response.write(renderErrorPage(
                        'Missing Quote ID',
                        'Please provide a valid quote ID in the URL (e.g., ?quote=12345).'
                    ));
                    return;
                }

                if (isNaN(parseInt(quoteId, 10))) {
                    log.error('QuoteViewer', 'Invalid quote ID: ' + quoteId);
                    context.response.write(renderErrorPage(
                        'Invalid Quote ID',
                        'The quote ID must be a valid number.'
                    ));
                    return;
                }

                // ─── Build filename prefix for search ────────────────────
                // Files are named: quote_{quoteId}_{opportunityId}_{timestamp}.html
                // We search with "startswith" to match any timestamp suffix
                var filePrefix = 'quote_' + quoteId;
                if (opportunityId) {
                    filePrefix += '_' + opportunityId;
                }

                log.audit('QuoteViewer', 'Searching for files with prefix: ' + filePrefix + ' in folder ' + QUOTE_HTML_FOLDER_ID);

                // ─── Search for matching HTML files ──────────────────────
                var fileSearch = search.create({
                    type: 'file',
                    filters: [
                        ['folder', 'is', QUOTE_HTML_FOLDER_ID],
                        'AND',
                        ['name', 'startswith', filePrefix]
                    ],
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'name', sort: search.Sort.DESC })
                    ]
                });

                var latestFileId = null;
                var latestFileName = null;
                var totalFiles = 0;

                fileSearch.run().each(function(result) {
                    totalFiles++;
                    // First result is the latest because we sort name DESC
                    // (timestamp in filename ensures alphabetical = chronological)
                    if (!latestFileId) {
                        latestFileId = result.getValue('internalid');
                        latestFileName = result.getValue('name');
                    }
                    return true; // Continue counting (for logging)
                });

                log.audit('QuoteViewer', 'Found ' + totalFiles + ' file(s). Latest: ' + latestFileName + ' (ID: ' + latestFileId + ')');

                // ─── Handle no file found ────────────────────────────────
                if (!latestFileId) {
                    log.error('QuoteViewer', 'No HTML file found for prefix: ' + filePrefix);
                    context.response.write(renderErrorPage(
                        'Quote Not Found',
                        'The requested quote could not be found. It may not have been generated yet. ' +
                        'Please contact your account manager for assistance.'
                    ));
                    return;
                }

                // ─── Load and serve the file ─────────────────────────────
                log.audit('QuoteViewer', 'Loading file ID: ' + latestFileId);
                var htmlFile = file.load({ id: latestFileId });
                var htmlContent = htmlFile.getContents();

                log.audit('QuoteViewer', 'Serving HTML content, length: ' + htmlContent.length + ' chars');

                // ─── Set no-cache headers ────────────────────────────────
                // Ensures the viewer always sees the latest content
                context.response.setHeader({
                    name: 'Content-Type',
                    value: 'text/html; charset=UTF-8'
                });
                context.response.setHeader({
                    name: 'Cache-Control',
                    value: 'no-cache, no-store, must-revalidate'
                });
                context.response.setHeader({
                    name: 'Pragma',
                    value: 'no-cache'
                });
                context.response.setHeader({
                    name: 'Expires',
                    value: '0'
                });

                // ─── Write the HTML content ──────────────────────────────
                context.response.write(htmlContent);

                var elapsed = Date.now() - startTime;
                log.audit('QuoteViewer', 'Quote ' + quoteId + ' served successfully in ' + elapsed + 'ms (' + totalFiles + ' version(s) found)');

            } catch (e) {
                log.error('QuoteViewer Error', e.name + ': ' + e.message + '\n' + (e.stack || ''));

                context.response.write(renderErrorPage(
                    'Error Loading Quote',
                    'An error occurred while loading your quote. Please contact your account manager for assistance.' +
                    '<br><br><small style="color:#999;">Error ref: ' + (e.name || 'UNKNOWN') + ' | v' + SCRIPT_VERSION + '</small>'
                ));
            }
        }

        // =====================================================================
        // ERROR PAGE RENDERER
        // =====================================================================

        /**
         * Renders a branded error page.
         * 
         * @param {string} title - Error title
         * @param {string} message - Error message
         * @returns {string} HTML string
         */
        function renderErrorPage(title, message) {
            return '<!DOCTYPE html>' +
                '<html lang="en">' +
                '<head>' +
                '<meta charset="UTF-8">' +
                '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
                '<title>Nu-Heat - ' + title + '</title>' +
                '<style>' +
                'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; ' +
                'margin: 0; padding: 40px 20px; background: #f5f5f5; color: #333; }' +
                '.container { max-width: 600px; margin: 0 auto; background: #fff; padding: 40px; ' +
                'border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }' +
                'h1 { color: #009B8D; font-size: 24px; margin-bottom: 16px; }' +
                'p { color: #666; font-size: 16px; line-height: 1.6; }' +
                '.brand { color: #009B8D; font-weight: bold; font-size: 18px; margin-bottom: 20px; }' +
                '</style>' +
                '</head>' +
                '<body>' +
                '<div class="container">' +
                '<div class="brand">Nu-Heat</div>' +
                '<h1>' + title + '</h1>' +
                '<p>' + message + '</p>' +
                '</div>' +
                '</body>' +
                '</html>';
        }

        // =====================================================================
        // MODULE EXPORTS
        // =====================================================================

        return {
            onRequest: onRequest
        };
    }
);
