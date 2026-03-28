/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * 
 * Nu-Heat Quote User Event Script
 * 
 * Description: Auto-generates online quote HTML when a quote is created or updated.
 * Uses direct module import to call generateAndSaveHTML from the Suitelet module,
 * eliminating the need for HTTP requests and resolving the permissions issue.
 * 
 * Author: Nu-Heat Development Team
 * Version: 4.0.8
 * Created: March 2026
 * 
 * v4.0.8 Changes:
 * - FIXED: SSS_INVALID_SRCH_COL error when generating quotes
 *   Root cause: The imported Suitelet module (nuheat_quote_suitelet.js) was using
 *   search.lookupFields() with invalid column names ('subtotal', 'taxtotal',
 *   'discounttotal') that are not searchable via the Search API.
 *   Fix: The Suitelet (v4.3.50+) now uses a 2-tier data system:
 *     TIER 1: Client script passes fresh pricing via URL parameters
 *     TIER 2: record.load() to read pricing directly from the record
 *   This UE script always triggers TIER 2 (no URL params from afterSubmit context).
 * - Added USE_PROXY_URL configuration toggle
 *   When false, generates direct File Cabinet URLs instead of Viewer proxy URLs.
 *   This bypasses the "You do not have privileges" error that can occur when the
 *   Quote Viewer deployment isn't correctly configured for public access.
 * - Added version tracking in audit logs for easier troubleshooting
 * - Enhanced error messages with specific guidance
 * 
 * v4.0.7 Changes:
 * - FIXED: Duplicate buttons appearing alongside "Regen quote"
 *   Root cause: Old UE deployment or form customization was still adding
 *   "Generate Online Quote" and "View Online Quote" buttons.
 *   Fix: Added defensive removeButton() calls to remove any legacy buttons
 *   before adding the new "Regen quote" button.
 * 
 * v4.0.6 Changes:
 * - Renamed "Generate Online Quote" button to "Regen quote"
 * - Removed "View Online Quote" button (custpage_view_quote)
 * - Removed "Copy Quote URL" button (custpage_copy_quote_url)
 * - Simplified beforeLoad to only add a single button
 * 
 * v4.0.5 Changes:
 * - FIXED: "You do not have privileges to view this page" error
 *   Root cause: https.get() from User Event context to a Suitelet in the same
 *   account is blocked by NetSuite's internal security, even with 
 *   "Available Without Login" enabled on the Suitelet deployment.
 * - SOLUTION: Replaced https.get() call with direct module import.
 *   The Suitelet now exports generateAndSaveHTML(), allowing the User Event
 *   to call it directly as a function - no HTTP request needed.
 * - Removed N/https and N/url module dependencies (no longer needed)
 * - Added N/task module for optional Scheduled Script fallback
 * - Updated BRAND colors to match Nu-Heat brand guidelines
 * 
 * v4.0.4 Changes:
 * - Fixed "The URL must be a fully qualified HTTPS URL" error in afterSubmit
 * - Added returnExternalUrl: true to url.resolveScript()
 * 
 * v4.0.3 Changes:
 * - Added "View Online Quote" and "Copy Quote URL" buttons to the form
 * - Both buttons are always visible for better UX
 * - Button handlers in client script handle missing URL gracefully
 * 
 * Dependencies:
 * - nuheat_quote_suitelet.js v4.3.50+ (must be in same folder - imported as module)
 *   IMPORTANT: The Suitelet MUST be v4.3.50 or later to avoid SSS_INVALID_SRCH_COL error.
 * - nuheat_quote_cs.js (client script for button handlers)
 * - Custom field: custbody_test_new_quote (on Estimate record)
 * - File Cabinet folder: Quote HTML Files (ID: 26895192)
 * 
 * Architecture Note:
 * -----------------
 * The Suitelet script (nuheat_quote_suitelet.js) exports both:
 *   - onRequest: for handling Suitelet HTTP requests (view/generate via URL)
 *   - generateAndSaveHTML: for direct server-side calls from other scripts
 * 
 * This User Event imports the Suitelet as a module and calls
 * generateAndSaveHTML() directly, which:
 *   1. Loads the quote data from the Estimate record (using record.load, NOT search.lookupFields)
 *   2. Renders the full HTML page
 *   3. Saves the HTML file to the File Cabinet
 *   4. Updates custbody_test_new_quote with the public URL
 * 
 * If direct import fails (e.g., governance limit exceeded), the script
 * falls back to triggering a Scheduled Script via N/task.
 * 
 * Pricing Data Flow (v4.0.8 / Suitelet v4.3.50):
 * ------------------------------------------------
 * When called from the UE (afterSubmit), there are NO URL parameters available.
 * The Suitelet detects this and uses TIER 2: record.load() to read pricing.
 * This is reliable because afterSubmit runs after the record is fully committed.
 * The previous search.lookupFields() approach caused SSS_INVALID_SRCH_COL
 * because 'subtotal', 'taxtotal', 'discounttotal' are summary fields that
 * cannot be retrieved via the N/search module.
 */

define(['N/runtime', 'N/record', 'N/log', 'N/task', './nuheat_quote_suitelet'],
function(runtime, record, log, task, quoteSuitelet) {
    
    // =====================================================================
    // CONFIGURATION
    // =====================================================================
    
    var SCRIPT_VERSION = '4.0.9';
    
    // Set to true to enable auto-generation on quote create/edit
    var AUTO_GENERATE_ENABLED = true;
    
    // =====================================================================
    // PROXY URL CONFIGURATION (v4.0.8)
    // =====================================================================
    // 
    // When USE_PROXY_URL is true (default):
    //   The Suitelet generates a proxy URL via the Quote Viewer Suitelet.
    //   This provides stable URLs that don't change when quotes are regenerated.
    //   REQUIRES: Quote Viewer deployment with "Available Without Login" checked.
    //
    // When USE_PROXY_URL is false:
    //   The Suitelet falls back to direct File Cabinet URLs.
    //   These URLs are always accessible (File Cabinet has its own permissions)
    //   but will change each time the quote is regenerated.
    //   Use this if you see "You do not have privileges" errors on proxy URLs.
    //
    // TROUBLESHOOTING "You do not have privileges" on proxy URLs:
    //   1. Go to Customization > Scripting > Script Deployments
    //   2. Find: customdeploy_nuheat_quote_viewer
    //   3. Check "Available Without Login" is ticked
    //   4. Check Status is "Released" (not "Testing")
    //   5. Check Audience tab > Roles includes the correct roles
    //   6. Save and clear browser cache
    //   If the issue persists, set USE_PROXY_URL = false as a workaround.
    //
    var USE_PROXY_URL = true; // v4.0.9: Enabled - Quote Viewer now has correct permissions (All External Roles + Available Without Login)
    
    // Scheduled Script fallback configuration
    // Only used if direct module call fails due to governance limits
    var FALLBACK_SCRIPT_ID = 'customscript_nuheat_quote_gen_ss';
    var FALLBACK_DEPLOYMENT_ID = 'customdeploy_nuheat_quote_gen_ss';
    
    // =====================================================================
    // AFTER SUBMIT
    // =====================================================================
    
    /**
     * After Submit event handler
     * Triggers HTML generation after quote is created or edited
     * 
     * v4.0.8: Now compatible with Suitelet v4.3.50 (no search.lookupFields)
     * v4.0.5: Uses direct module import instead of https.get()
     * 
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - New record
     * @param {Record} context.oldRecord - Old record (for edit)
     * @param {string} context.type - Event type (create, edit, delete, etc.)
     */
    function afterSubmit(context) {
        try {
            // Only run on create and edit
            if (context.type !== context.UserEventType.CREATE && 
                context.type !== context.UserEventType.EDIT) {
                log.debug('Quote UE', 'Skipping - event type: ' + context.type);
                return;
            }
            
            // Check if auto-generation is enabled
            if (!AUTO_GENERATE_ENABLED) {
                log.debug('Quote UE', 'Auto-generation disabled');
                return;
            }
            
            var quoteRecord = context.newRecord;
            var quoteId = quoteRecord.id;
            
            log.audit('Quote UE v' + SCRIPT_VERSION, 
                'Generating online quote for ID: ' + quoteId + 
                ' | USE_PROXY_URL: ' + USE_PROXY_URL +
                ' | Suitelet version: ' + (quoteSuitelet.SCRIPT_VERSION || 'unknown'));
            
            // Check remaining governance before attempting generation
            var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
            log.debug('Quote UE', 'Remaining governance units: ' + remainingUsage);
            
            // If we have enough governance, call generateAndSaveHTML directly
            // The function typically uses ~200-400 governance units depending on
            // the number of line items (record.load, search.create, file.create, etc.)
            if (remainingUsage > 500) {
                log.debug('Quote UE', 'Using direct module import (sufficient governance)');
                
                // v4.0.8: Pass configuration options to the Suitelet
                var result = quoteSuitelet.generateAndSaveHTML(quoteId, {
                    useProxyUrl: USE_PROXY_URL,
                    calledFrom: 'UserEvent_afterSubmit_v' + SCRIPT_VERSION
                });
                
                if (result && result.success) {
                    log.audit('Quote UE', 'Online quote generated successfully' +
                        ' | URL: ' + result.url +
                        ' | URL type: ' + (result.urlType || 'unknown') +
                        ' | File ID: ' + (result.fileId || 'unknown'));
                } else {
                    var errorMsg = result ? result.error : 'No result returned';
                    log.error('Quote UE', 'Failed to generate online quote: ' + errorMsg);
                    
                    // Try fallback if direct call returned an error
                    triggerScheduledScriptFallback(quoteId);
                }
            } else {
                // Not enough governance - use Scheduled Script fallback
                log.audit('Quote UE', 'Insufficient governance (' + remainingUsage + 
                    ' units remaining). Using Scheduled Script fallback.');
                triggerScheduledScriptFallback(quoteId);
            }
            
        } catch (e) {
            // Log error but don't throw - we don't want to block quote saves
            log.error('Quote UE v' + SCRIPT_VERSION + ' Error', {
                message: e.message,
                name: e.name || 'UnknownError',
                stack: e.stack,
                quoteId: context.newRecord ? context.newRecord.id : 'unknown',
                hint: e.name === 'SSS_INVALID_SRCH_COL' 
                    ? 'CRITICAL: The Suitelet module needs to be updated to v4.3.50+. ' +
                      'The old version uses search.lookupFields() with invalid columns. ' +
                      'Please upload the latest nuheat_quote_suitelet.js to the File Cabinet.'
                    : 'Check the Suitelet script execution log for more details.'
            });
            
            // Try scheduled script fallback as last resort
            try {
                if (context.newRecord && context.newRecord.id) {
                    triggerScheduledScriptFallback(context.newRecord.id);
                }
            } catch (fallbackError) {
                log.error('Quote UE Fallback Error', {
                    message: fallbackError.message,
                    originalError: e.message
                });
            }
        }
    }
    
    /**
     * Fallback: Trigger a Scheduled Script to generate the HTML
     * Used when:
     * - Direct module call fails (governance, timeout, etc.)
     * - Remaining governance is too low for inline generation
     * 
     * The Scheduled Script runs asynchronously in its own execution context
     * with 10,000 governance units (vs User Event's 1,000).
     * 
     * @param {string|number} quoteId - The internal ID of the quote
     */
    function triggerScheduledScriptFallback(quoteId) {
        try {
            var scriptTask = task.create({
                taskType: task.TaskType.SCHEDULED_SCRIPT,
                scriptId: FALLBACK_SCRIPT_ID,
                deploymentId: FALLBACK_DEPLOYMENT_ID,
                params: {
                    custscript_nuheat_gen_quote_id: String(quoteId)
                }
            });
            
            var taskId = scriptTask.submit();
            log.audit('Quote UE Fallback', 'Scheduled Script triggered - Task ID: ' + taskId + 
                ' for Quote ID: ' + quoteId);
                
        } catch (taskError) {
            // Log but don't throw - this is a fallback, we don't want to cascade errors
            log.error('Quote UE Fallback Failed', {
                message: taskError.message,
                quoteId: quoteId,
                note: 'Quote HTML was not generated. Use the manual "Regen quote" button.'
            });
        }
    }
    
    // =====================================================================
    // BEFORE LOAD (adds buttons to form)
    // =====================================================================
    
    /**
     * Before Load event handler
     * Adds "Regen quote" button to the quote form
     * 
     * v4.0.7: Simplified to single button. Removed "View Online Quote" and "Copy Quote URL".
     * 
     * @param {Object} context - Script context
     * @param {Record} context.newRecord - Record being loaded
     * @param {Form} context.form - Current form
     * @param {string} context.type - Event type
     */
    function beforeLoad(context) {
        try {
            // Only add buttons in view and edit modes
            if (context.type !== context.UserEventType.VIEW && 
                context.type !== context.UserEventType.EDIT) {
                return;
            }
            
            log.debug('Quote UE beforeLoad', 'Adding quote buttons to form (v' + SCRIPT_VERSION + ')');
            
            // ---------------------------------------------------------------
            // DEFENSIVE: Remove any legacy buttons that may have been added
            // by old script deployments or form customizations.
            // removeButton() is safe to call even if the button doesn't exist.
            // ---------------------------------------------------------------
            var legacyButtonIds = [
                'custpage_generate_quote',      // Old "Generate Online Quote" button
                'custpage_view_quote',           // Old "View Online Quote" button
                'custpage_copy_quote_url',       // Old "Copy Quote URL" button
                'custpage_generate_online_quote' // Possible variant
            ];
            
            for (var i = 0; i < legacyButtonIds.length; i++) {
                try {
                    context.form.removeButton({ id: legacyButtonIds[i] });
                    log.debug('Quote UE beforeLoad', 'Removed legacy button: ' + legacyButtonIds[i]);
                } catch (removeError) {
                    // Button didn't exist - that's fine, ignore
                }
            }
            
            // Add the single "Regen quote" button
            context.form.addButton({
                id: 'custpage_regen_quote',
                label: 'Regen quote',
                functionName: 'generateOnlineQuote'
            });
            
            // Add client script for button functionality
            context.form.clientScriptModulePath = './nuheat_quote_cs.js';
            
            log.debug('Quote UE beforeLoad', 'Regen quote button added successfully');
            
        } catch (e) {
            log.error('Quote UE beforeLoad Error', e.message);
        }
    }
    
    return {
        afterSubmit: afterSubmit,
        beforeLoad: beforeLoad
    };
});
