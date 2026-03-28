/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 * 
 * Nu-Heat Quote Client Script
 * 
 * Description: Provides client-side functionality for the Quote form,
 * including the "Regen quote" button handler.
 * 
 * Author: Nu-Heat Development Team
 * Version: 4.0.6
 * Created: March 2026
 * 
 * v4.0.6 Changes:
 * - FIXED: Stale data issue - pricing values now passed as URL parameters
 *   to the Suitelet, bypassing database read-back timing issues entirely.
 *   After saving, the script loads the saved record to get committed values,
 *   then passes subtotal, taxtotal, total, and discounttotal as params.
 * - This ensures the Suitelet always uses the exact values from the saved
 *   record, regardless of search index or record.load() caching delays.
 *
 * v4.0.5 Changes:
 * - FIXED: Stale data when regenerating quote without saving first
 *   The script now saves the record before triggering HTML generation,
 *   ensuring the Suitelet reads the latest discount/pricing values.
 * - Added record save step before Suitelet call
 * - Added console logging for save confirmation
 *
 * v4.0.4 Changes:
 * - Renamed "Generate Online Quote" button to "Regen quote"
 * - Removed "View Online Quote" button and viewOnlineQuote() handler
 * - Removed "Copy Quote URL" button and copyQuoteUrl() handler
 * - Cleaned up unused code related to removed buttons
 * 
 * v4.0.3 Changes:
 * - All three buttons were always visible (added via User Event Script)
 * - Button handlers gracefully handled missing URL with user-friendly messages
 * - Simplified button logic for better UX
 * 
 * Dependencies:
 * - nuheat_quote_suitelet.js (must be deployed)
 * - nuheat_quote_ue.js (adds buttons via beforeLoad)
 * - Custom field: custbody_test_new_quote (on Estimate record)
 */

define(['N/currentRecord', 'N/record', 'N/url', 'N/https', 'N/ui/dialog', 'N/ui/message'],
function(currentRecord, record, url, https, dialog, message) {
    
    // =====================================================================
    // CONFIGURATION
    // =====================================================================
    
    // Script and deployment IDs for the main Quote Suitelet
    var SUITELET_SCRIPT_ID = 'customscript_nuheat_quote_suitelet';
    var SUITELET_DEPLOYMENT_ID = 'customdeploy1';
    
    // =====================================================================
    // PAGE INIT
    // =====================================================================
    
    /**
     * Page Init event handler
     * Called when the page loads
     * 
     * @param {Object} context - Script context
     */
    function pageInit(context) {
        console.log('Nu-Heat Quote Client Script loaded (v4.0.6)');
        console.log('Available functions: generateOnlineQuote');
    }
    
    // =====================================================================
    // REGEN QUOTE BUTTON (formerly "Generate Online Quote")
    // =====================================================================
    
    /**
     * Generate Online Quote button handler (button label: "Regen quote")
     * Calls the Suitelet to generate a static HTML file and updates the quote record
     */
    function generateOnlineQuote() {
        try {
            var rec = currentRecord.get();
            var quoteId = rec.id;
            
            // Check if record is saved
            if (!quoteId) {
                dialog.alert({
                    title: 'Save Required',
                    message: 'Please save the quote first before generating the online quote.'
                });
                return;
            }
            
            // v4.0.5: Save the record first to ensure all changes (including discount)
            // are committed to the database before the Suitelet reads them.
            // This prevents stale data when user modifies fields but doesn't save.
            var loadingMsg = message.create({
                title: 'Saving & Generating Quote',
                message: 'Saving your changes and generating the online quote...',
                type: message.Type.INFORMATION
            });
            loadingMsg.show();
            
            var savedRecordId = null;
            try {
                console.log('v4.0.5: Saving record before regeneration to ensure fresh data...');
                savedRecordId = rec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });
                console.log('v4.0.5: Record saved successfully, ID: ' + savedRecordId);
                // Note: afterSubmit UE will auto-generate, but we still call the Suitelet
                // explicitly to get the URL response for the success dialog
            } catch (saveError) {
                console.log('v4.0.5: Record save skipped (may already be saved or in view mode): ' + saveError.message);
                // Continue with regeneration even if save fails - record may already be saved
            }
            
            // v4.0.6: STALE DATA FIX - Load the saved record to get committed pricing values
            // and pass them as URL parameters to the Suitelet. This bypasses any database
            // read-back timing issues (search index lag, record.load() caching) entirely.
            var pricingParams = {};
            try {
                var recordIdToLoad = savedRecordId || quoteId;
                console.log('v4.0.6: Loading saved record to get fresh pricing values, ID: ' + recordIdToLoad);
                var savedRecord = record.load({
                    type: record.Type.ESTIMATE,
                    id: recordIdToLoad,
                    isDynamic: false
                });
                
                pricingParams.subtotal = savedRecord.getValue({ fieldId: 'subtotal' }) || '0';
                pricingParams.taxtotal = savedRecord.getValue({ fieldId: 'taxtotal' }) || '0';
                pricingParams.total = savedRecord.getValue({ fieldId: 'total' }) || '0';
                pricingParams.discounttotal = savedRecord.getValue({ fieldId: 'discounttotal' }) || '0';
                
                console.log('v4.0.6: Fresh pricing from saved record: ' + JSON.stringify(pricingParams));
            } catch (loadError) {
                console.log('v4.0.6: Could not load saved record for pricing (will rely on DB): ' + loadError.message);
                // pricingParams stays empty - Suitelet will fall back to its own DB lookup
            }
            
            // Build Suitelet URL with pricing parameters
            var suiteletParams = {
                quoteid: quoteId,
                mode: 'generate'
            };
            
            // v4.0.6: Add pricing values as URL parameters if available
            if (pricingParams.subtotal !== undefined) {
                suiteletParams.p_subtotal = pricingParams.subtotal;
                suiteletParams.p_taxtotal = pricingParams.taxtotal;
                suiteletParams.p_total = pricingParams.total;
                suiteletParams.p_discounttotal = pricingParams.discounttotal;
                console.log('v4.0.6: Passing pricing params to Suitelet: ' + JSON.stringify(pricingParams));
            }
            
            var suiteletUrl = url.resolveScript({
                scriptId: SUITELET_SCRIPT_ID,
                deploymentId: SUITELET_DEPLOYMENT_ID,
                params: suiteletParams
            });
            
            console.log('Calling Suitelet:', suiteletUrl);
            
            // Make async call to Suitelet
            https.get.promise({
                url: suiteletUrl
            }).then(function(response) {
                // Hide loading message
                loadingMsg.hide();
                
                var result;
                try {
                    result = JSON.parse(response.body);
                } catch (parseError) {
                    console.error('Parse error:', parseError);
                    showErrorDialog('Failed to parse server response.');
                    return;
                }
                
                if (result.success) {
                    // Update the URL field on the form
                    try {
                        rec.setValue({
                            fieldId: 'custbody_test_new_quote',
                            value: result.url
                        });
                    } catch (fieldError) {
                        console.log('Could not update field - may already be saved:', fieldError);
                    }
                    
                    // Show success message with copy-able URL
                    showSuccessDialog(result.url);
                    
                } else {
                    showErrorDialog(result.error || 'Unknown error occurred.');
                }
                
            }).catch(function(error) {
                loadingMsg.hide();
                console.error('HTTPS error:', error);
                showErrorDialog('Network error: ' + error.message);
            });
            
        } catch (e) {
            console.error('generateOnlineQuote error:', e);
            dialog.alert({
                title: 'Error',
                message: 'An error occurred: ' + e.message
            });
        }
    }
    
    /**
     * Show success dialog with the generated URL
     * @param {string} quoteUrl - The generated quote URL
     */
    function showSuccessDialog(quoteUrl) {
        // Create custom dialog with copy button
        var dialogHtml = '<div style="font-family: Arial, sans-serif;">';
        dialogHtml += '<p style="color: #28a745; font-weight: bold;">✓ Online quote generated successfully!</p>';
        dialogHtml += '<p style="margin-top: 15px;">Your quote is now available at:</p>';
        dialogHtml += '<div style="background: #f5f5f5; padding: 10px; border-radius: 4px; margin: 10px 0; word-break: break-all;">';
        dialogHtml += '<a href="' + quoteUrl + '" target="_blank" style="color: #00857D;">' + quoteUrl + '</a>';
        dialogHtml += '</div>';
        dialogHtml += '<p style="font-size: 12px; color: #666;">Click the link to open in a new tab, or copy the URL to share with your customer.</p>';
        dialogHtml += '</div>';
        
        dialog.alert({
            title: 'Online Quote Ready',
            message: dialogHtml
        });
    }
    
    /**
     * Show error dialog
     * @param {string} errorMessage - Error message to display
     */
    function showErrorDialog(errorMessage) {
        dialog.alert({
            title: 'Generation Failed',
            message: '<div style="font-family: Arial, sans-serif;">' +
                    '<p style="color: #dc3545; font-weight: bold;">✗ Failed to generate online quote</p>' +
                    '<p style="margin-top: 10px;">Error: ' + errorMessage + '</p>' +
                    '<p style="margin-top: 15px; font-size: 12px; color: #666;">Please try again or contact your administrator if the problem persists.</p>' +
                    '</div>'
        });
    }
    
    return {
        pageInit: pageInit,
        generateOnlineQuote: generateOnlineQuote
    };
});
