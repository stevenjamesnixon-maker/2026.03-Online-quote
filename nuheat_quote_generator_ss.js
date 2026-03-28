/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope Public
 * 
 * Nu-Heat Quote Generator - Scheduled Script
 * 
 * Description: Fallback mechanism for generating online quote HTML files.
 * Triggered by the User Event script (nuheat_quote_ue.js) when direct
 * module import fails or governance is insufficient.
 * 
 * This script imports the Suitelet module and calls generateAndSaveHTML()
 * directly, running in its own execution context with higher governance
 * limits (10,000 units vs User Event's 1,000).
 * 
 * Author: Nu-Heat Development Team
 * Version: 1.0.0
 * Created: March 2026
 * 
 * Script Parameters:
 * - custscript_nuheat_gen_quote_id (Free-Form Text): The internal ID of the
 *   Estimate/Quote record to generate HTML for.
 * 
 * Dependencies:
 * - nuheat_quote_suitelet.js (imported as module for generateAndSaveHTML)
 * - Custom field: custbody_test_new_quote (on Estimate record)
 * - File Cabinet folder: Quote HTML Files (ID: 21719365)
 * 
 * Deployment:
 * - Script ID: customscript_nuheat_quote_gen_ss
 * - Deployment ID: customdeploy_nuheat_quote_gen_ss
 * - Status: Released
 * - Log Level: Debug (change to Audit for production)
 */

define(['N/runtime', 'N/log', './nuheat_quote_suitelet'],
function(runtime, log, quoteSuitelet) {
    
    /**
     * Scheduled Script execute entry point
     * 
     * Reads the quote ID from the script parameter and calls
     * generateAndSaveHTML from the Suitelet module.
     * 
     * @param {Object} context - Script context
     */
    function execute(context) {
        try {
            var script = runtime.getCurrentScript();
            var quoteId = script.getParameter({ name: 'custscript_nuheat_gen_quote_id' });
            
            if (!quoteId) {
                log.error('Quote Generator SS', 'No quote ID provided in script parameter');
                return;
            }
            
            log.audit('Quote Generator SS', 'Starting HTML generation for quote: ' + quoteId);
            log.debug('Quote Generator SS', 'Remaining governance: ' + script.getRemainingUsage());
            
            // Call generateAndSaveHTML directly from the Suitelet module
            var result = quoteSuitelet.generateAndSaveHTML(quoteId);
            
            if (result && result.success) {
                log.audit('Quote Generator SS', 'Successfully generated HTML for quote ' + quoteId + 
                    ' - URL: ' + result.url + ' - File ID: ' + result.fileId);
            } else {
                var errorMsg = result ? result.error : 'No result returned from generateAndSaveHTML';
                log.error('Quote Generator SS', 'Failed to generate HTML for quote ' + quoteId + 
                    ': ' + errorMsg);
            }
            
            log.debug('Quote Generator SS', 'Governance remaining after generation: ' + 
                script.getRemainingUsage());
            
        } catch (e) {
            log.error('Quote Generator SS Error', {
                message: e.message,
                stack: e.stack,
                name: e.name
            });
        }
    }
    
    return {
        execute: execute
    };
});
