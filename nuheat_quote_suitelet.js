/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 * 
 * Nu-Heat Quote Page Suitelet
 * 
 * Description: Generates branded HTML quote pages for customers
 * accessible via public URL with print-to-PDF functionality.
 * 
 * Author: Nu-Heat Development Team
 * Version: 4.3.54
 * Created: February 2026
 * Updated: 28 March 2026 - v4.3.49: Suitelet Proxy for stable URLs, timestamped filenames, file cleanup
 * Updated: 28 March 2026 - v4.3.50: Removed invalid search.lookupFields() for pricing, simplified data priority
 * Updated: 28 March 2026 - v4.3.53: Enabled proxy URLs by default - Quote Viewer permissions fixed (All External Roles)
 *          (matching UE script behaviour) instead of proxy URLs that caused permissions errors in popup
 * 
 * For detailed version history, see CHANGELOG.md
 */

define(['N/record', 'N/search', 'N/log', 'N/format', 'N/error', 'N/runtime', 'N/file', 'N/url'],
    function(record, search, log, format, error, runtime, file, url) {

        // =====================================================================
        // SCRIPT VERSION
        // =====================================================================
        var SCRIPT_VERSION = '4.3.54';
        
        // =====================================================================
        // THERMOSTAT OPTIONS CONFIGURATION (v4.3.9)
        // =====================================================================
        // Item IDs for thermostat options section - loaded dynamically
        var THERMOSTAT_OPTION_ITEM_IDS = ['DSSB5-C', 'neoHub+-C', 'Neostatwv2-C', 'NeoAirwv3-C'];
        var RECOMMENDED_ITEM_ID = 'neoHub+-C'; // Item to show "Recommended" badge

        // =====================================================================
        // CONFIGURATION FOR HTML GENERATION (v4.0.0)
        // =====================================================================
        // Folder: SuiteScripts > NuHeat > Quote HTML Files
        // Folder ID: 26895192
        // Make sure the folder has "Available Without Login" permission
        var QUOTE_HTML_FOLDER_ID = 26895192;

        // =====================================================================
        // PRODUCT IMAGE SPECIFICATIONS (v3.7.0)
        // =====================================================================
        /*
         * PRODUCT IMAGE SPECIFICATIONS FOR NETSUITE FILE CABINET
         * 
         * Ideal dimensions: 400px x 400px (square)
         * Minimum dimensions: 200px x 200px
         * Maximum dimensions: 800px x 800px
         * Aspect ratio: 1:1 (square) or 4:3 (landscape) preferred
         * File format: JPG or PNG (PNG recommended for transparency)
         * File size: Under 500KB for optimal loading
         * Resolution: 72-150 DPI (web standard)
         * 
         * Images are displayed at max 200px x 200px in product cards
         * but higher resolution (400px) recommended for retina displays
         * and quality rendering across devices.
         * 
         * Upload images to NetSuite File Cabinet and reference using
         * the custitem_prod_image field on item records (file internal ID).
         */

        // =====================================================================
        // BRAND CONFIGURATION
        // =====================================================================
        /**
         * Nu-Heat Logo PNG - Base64 encoded 600px PNG
         * v4.3.1: Clean base64 PNG logo at 600px width, display size 120px header / 80px footer (inline styles)
         * 
         * IMPORTANT: NetSuite BFO PDF Renderer SVG Compatibility Notes:
         * ============================================================
         * 1. SIZE CONSIDERATIONS:
         *    - Keep SVG file size under 100KB for reliable rendering
         *    - Use viewBox for scalability, not fixed width/height
         *    - Recommended viewBox dimensions: 200-400px width for logos
         * 
         * 2. SVG FEATURES TO AVOID (not supported by BFO):
         *    - CSS animations and transitions
         *    - filter effects (blur, drop-shadow, etc.)
         *    - clipPath with complex shapes
         *    - mask elements
         *    - foreignObject elements
         *    - External references (use, image with external href)
         *    - JavaScript in SVG
         *    - Complex gradients (simple linear/radial OK but may vary)
         * 
         * 3. SAFE SVG FEATURES FOR BFO:
         *    - Basic shapes (rect, circle, ellipse, line, polyline, polygon)
         *    - Path elements with standard commands (M, L, C, Q, A, Z)
         *    - Text elements with web-safe fonts
         *    - Fill and stroke with solid colors
         *    - Simple transforms (translate, rotate, scale)
         *    - Inline styles or presentation attributes
         * 
         * 4. DATA URI ENCODING:
         *    - Use URL encoding (%3C for <, %3E for >, %23 for #, etc.)
         *    - Avoid base64 for SVG when possible (URL encoding is smaller)
         *    - Ensure proper MIME type: data:image/svg+xml
         * 
         * The leaf element is positioned above the 'ü' in Nü-Heat as per brand guidelines.
         */
        const NUHEAT_LOGO_BASE64 = "data:image/png;base64,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";

        const CONFIG = {
            contact: {
                phone: '01404 540650',
                email: 'info@nu-heat.co.uk',
                website: 'www.nu-heat.co.uk'
            },
            logo: {
                base64: NUHEAT_LOGO_BASE64,
                altText: 'Nu-Heat - Feel the difference'
            }
        };

        // BRAND configuration object - used throughout the template for consistent styling
        // v4.3.36: Updated colors to match Nu-Heat brand guidelines (from unified HTML template)
        const BRAND = {
            colors: {
                primary: '#00857D',       // Nu-Heat teal (brand primary)
                primaryDark: '#074F71',   // Dark navy (brand primary dark)
                secondary: '#00B0B9',     // Light teal (brand secondary)
                accent: '#E35205',        // Orange accent for warnings/errors
                yellow: '#FFB500',        // Yellow for highlights
                purple: '#59315F',        // Purple accent
                magenta: '#AA0061',       // Magenta accent (CTA buttons)
                textPrimary: '#53565A',   // Primary text color (brand gray)
                textSecondary: '#796E65', // Secondary/muted text (warm gray)
                lightGray: '#D9D9D6',     // Light gray backgrounds
                white: '#ffffff',         // White
                background: '#F5F5F5',    // Page background
                success: '#00b67a'        // Success green
            },
            contact: {
                phone: '01404 540650',
                email: 'info@nu-heat.co.uk',
                website: 'www.nu-heat.co.uk'
            },
            logo: {
                base64: NUHEAT_LOGO_BASE64,
                altText: 'Nu-Heat - Feel the difference'
            }
        };

        // =====================================================================
        // HARDCODED PRODUCT TYPE ID MAPPING
        // =====================================================================
        // This maps internal IDs from custitem_prod_type to display names
        // Source: NetSuite Custom List "customlist_prod_type" (custitem_prod_type)
        // Last Updated: 28 February 2026
        // 
        // IMPORTANT: When new product types are added to NetSuite, add them here!
        // Format: 'internalId': 'Display Name'
        const PRODUCT_TYPE_ID_MAP = {
            '1': 'Alupipe/Pex',
            '2': 'Floor Construction',
            '3': 'Manifold',
            '4': 'Pump Module',
            '5': 'Room Module',
            '6': 'Accessory',
            '7': 'Clip',
            '8': 'Distributor',
            '9': 'Cylinder',
            '10': 'Insulation',
            '11': 'Levelling Compound',
            '12': 'Edging Strip',
            '13': 'Water Treatment',
            '14': 'Plate',
            '15': 'Pipework',
            '16': 'Other Rooms',
            '17': 'Wiring & Electrics',
            '18': 'Rad/HE Output',
            '19': 'Fitting',
            '20': 'Radiator',
            '21': 'Trench Heating',
            '22': 'Controls',
            '23': 'Neo',
            '24': 'Wireless Controls',
            '25': 'Manual',
            '26': 'neoHub',
            '27': 'HP Unit',
            '28': 'ASHP',
            '29': 'GSHP',
            '30': 'Collector',
            '31': 'Solar',
            '32': 'Expansion',
            '33': 'Buffer Tank',
            '34': 'Valve',
            '35': 'Pump',
            '36': 'Controller',
            '37': 'Sensor',
            '38': 'Brine',
            '39': 'Antifreeze',
            '40': 'Integration',
            '41': 'Labour',
            '42': 'Training',
            '43': 'HP Accessory',
            '44': 'HP Controls',
            '45': 'PV',
            '46': 'Battery',
            '47': 'Commercial Thermostat',
            '48': 'Thermostat',
            '49': 'Fan Coil',
            '50': 'Air Handling',
            '51': 'Solar Accessory',
            '52': 'Decommissioning'
        };

        // =====================================================================
        // PRODUCT CATEGORY MAPPING (ID-BASED)
        // =====================================================================
        // Maps product type internal IDs to quote section categories
        // Reference: Quote content and logic.xlsx - "Quote logic" sheet
        //
        // UFH Section: Floor Construction (2), Manual (25), Thermostat (48), 
        //              Commercial Thermostat (47), Neo (23), Wireless Controls (24)
        // Heat Pump: HP Unit (27), Cylinder (9), HP Accessory (43), HP Controls (44),
        //            ASHP (28), GSHP (29), Buffer Tank (33)
        // Solar: Solar (31), Solar Accessory (51), PV (45), Collector (30)
        // Commissioning: Labour (41)
        const PRODUCT_CATEGORY_MAP = {
            UFH: [2, 25, 47, 48, 23, 24, 3, 4, 5, 22],  // Floor Construction, Manual, Thermostats, Neo, Controls, Manifold, Modules
            HEAT_PUMP: [27, 9, 43, 44, 28, 29, 33],  // HP Unit, Cylinder, HP Accessory, HP Controls, ASHP, GSHP, Buffer Tank
            SOLAR: [31, 51, 45, 30],                     // Solar, Solar Accessory, PV, Collector
            COMMISSIONING: [41]                          // Labour
        };

        // Legacy text-based matching (fallback ONLY for items without a valid product type ID)
        // Reference: Quote content and logic.xlsx - "Quote logic" sheet
        // v4.3.32: Removed 'pump module' from UFH keywords - ambiguous, could match Pump items
        const PRODUCT_TYPES = {
            UFH: [
                'floor construction',
                'thermostat',
                'commercial thermostat',
                'manual',
                'neo',
                'wireless controls',
                'manifold',
                'room module',
                'controls'
            ],
            HP: [
                'hp unit',
                'heat pump',
                'cylinder',
                'hp accessory',
                'hp controls',
                'ashp',
                'gshp',
                'buffer tank'
            ],
            SOLAR: [
                'solar',
                'solar accessory',
                'pv',
                'collector',
                'solar thermal'
            ],
            COMMISSIONING: [
                'labour',
                'labor',
                'commissioning'
            ]
        };

        // =====================================================================
        // PRODUCT TYPE SUB-CATEGORY MAPPINGS (for UFH tree structure)
        // =====================================================================
        // These map product type IDs to sub-categories within UFH section
        const UFH_SUBCATEGORY_MAP = {
            // Floor Construction sub-category
            FLOOR_CONSTRUCTION: [2],  // Floor Construction
            // Thermostat/Electrical sub-category
            ELECTRICAL: [47, 48, 23, 24, 22],  // Commercial Thermostat, Thermostat, Neo, Wireless Controls, Controls
            // Design Package / Manual sub-category
            MANUAL: [25]  // Manual
        };

        // =====================================================================
        // DESIGN PACKAGE ITEM DETECTION (v4.3.54)
        // =====================================================================
        // Detects whether a quote includes a Design Package item by matching
        // against NetSuite item internal IDs (NOT product type IDs).
        //
        // MPDP-C   = Standard UFH Design Package  (internal ID: 480)
        // MPDPCD-C = UFH Design+ Upgrade Package  (internal ID: 5488)
        //
        // These IDs are from the production NetSuite account.
        // If they differ in Sandbox, update accordingly.
        var DESIGN_PACKAGE_ITEMS = {
            STANDARD_UFH: '480',   // MPDP-C — Standard UFH Design Package
            UPGRADE_UFH:  '5488'   // MPDPCD-C — UFH Design+ Upgrade Package
        };

        // =====================================================================
        // EXCLUDED PRODUCT CATEGORIES (v4.3.33, fixed v4.3.34)
        // =====================================================================
        // Items whose custitem_prod_type getText() value matches any of these
        // will be excluded from product card sections (UFH, Heat Pump, Solar, Commissioning)
        // but will still appear in Component Breakdown.
        // This prevents items with prod_type display text "Pump" from appearing
        // as product cards even if their custitem_prod_type ID maps to a product section.
        // Checked against item.productTypeText (the getText() value of custitem_prod_type).
        // Values are compared case-insensitively.
        const EXCLUDED_PRODUCT_CATEGORIES = ['pump'];

        // =====================================================================
        // DESIGN PACKAGE ITEM DETECTION (hardcoded item internal IDs)
        // =====================================================================
        // These are NetSuite item internal IDs, NOT product type IDs.
        // MPDP-C = Standard UFH Design Package
        // MPDPCD-C = Upgrade UFH Design+ Package
        const DESIGN_PACKAGE_ITEMS = {
            STANDARD_UFH: '480',   // MPDP-C — Standard UFH Design
            UPGRADE_UFH: '5488'    // MPDPCD-C — UFH Design+ (upgrade)
        };

        // Design package product card images (hosted in NetSuite File Cabinet)
        // v4.3.38: Corrected design package image URLs to use NetSuite File Cabinet
        var DESIGN_PKG_IMG_BASE = 'https://472052.app.netsuite.com/core/media/media.nl';
        const DESIGN_PACKAGE_IMAGES = {
            STANDARD_UFH: DESIGN_PKG_IMG_BASE + '?id=43179014&c=472052&h=kR8e3MpaSu7hnYFKqCoL4aqCm8ux2iJwPMRgvBHhEw0CLJ4I',
            UPGRADE_UFH: DESIGN_PKG_IMG_BASE + '?id=43195828&c=472052&h=mMzatvegB7OVFqo6YSvYuHEDy37lUerOEavfPfUYPLu9DYWo',
            HEAT_PUMP: DESIGN_PKG_IMG_BASE + '?id=43179321&c=472052&h=cAYN9zmQNQKOq_tpOV_hcxCPC-VpGbttqTcJWiFvu1ZZu_0g'
        };

        // =====================================================================
        // HELPER FUNCTIONS FOR TREE STRUCTURE
        // =====================================================================
        
        /**
         * Check if a specific design package item exists in the line items.
         * Matches by item internal ID (itemId field).
         * @param {Array} lineItems - Array of all line items
         * @param {string} targetItemId - Internal ID to look for (e.g. '480')
         * @returns {boolean}
         */
        function hasDesignPackageItem(lineItems, targetItemId) {
            return lineItems.some(function(item) {
                return String(item.itemId) === String(targetItemId);
            });
        }

        /**
         * Check if the system includes a Heat Pump unit
         * @param {Array} lineItems - Array of line items
         * @returns {boolean} - True if system has HP unit
         */
        function hasHeatPumpUnit(lineItems) {
            return lineItems.some(function(item) {
                return getProductTypeId(item) === 27;
            });
        }

        /**
         * Filter items by product type IDs
         * @param {Array} items - Array of items to filter
         * @param {Array} typeIds - Array of product type IDs to match
         * @returns {Array} - Filtered items
         */
        function filterItemsByProductTypeId(items, typeIds) {
            return items.filter(function(item) {
                return typeIds.indexOf(getProductTypeId(item)) !== -1;
            });
        }

        /**
         * Get items that are NOT in the specified type IDs
         * @param {Array} items - Array of items
         * @param {Array} excludeTypeIds - Array of product type IDs to exclude
         * @returns {Array} - Remaining items
         */
        function getItemsExcluding(items, excludeTypeIds) {
            return items.filter(function(item) {
                return excludeTypeIds.indexOf(getProductTypeId(item)) === -1;
            });
        }

        /**
         * v4.3.33: Check if an item has an excluded product category
         * v4.3.34: Fixed to use productTypeText (getText() of custitem_prod_type)
         *          instead of non-existent custitem_product_category field
         * Compares item.productTypeText against EXCLUDED_PRODUCT_CATEGORIES (case-insensitive)
         * 
         * @param {Object} item - Line item with productTypeText property
         * @returns {boolean} - true if item should be excluded from product cards
         */
        function hasExcludedCategory(item) {
            var categoryText = (item.productTypeText || '').toLowerCase().trim();
            if (!categoryText) return false;
            return EXCLUDED_PRODUCT_CATEGORIES.some(function(excluded) {
                return categoryText === excluded;
            });
        }

        // =====================================================================
        // SHARED HELPERS (v4.3.42)
        // =====================================================================

        /**
         * Get numeric product type ID from an item
         * @param {Object} item - Line item object
         * @returns {number} - Parsed product type ID
         */
        function getProductTypeId(item) {
            return parseInt(item.productTypeRaw || item.productType || '0', 10);
        }

        /**
         * Filter items for rendering in a category section.
         * Excludes items with excluded product categories and items
         * whose product type ID isn't in the specified category map.
         * @param {Array} items - Array of items
         * @param {string} categoryKey - Key in PRODUCT_CATEGORY_MAP (e.g. 'UFH', 'HEAT_PUMP')
         * @returns {Array} - Filtered items safe for rendering
         */
        function filterForRender(items, categoryKey) {
            var allowedIds = PRODUCT_CATEGORY_MAP[categoryKey];
            return items.filter(function(item) {
                if (hasExcludedCategory(item)) return false;
                var id = getProductTypeId(item);
                return !(id > 0 && allowedIds.indexOf(id) === -1);
            });
        }

        /**
         * Split a '*'-delimited field value into trimmed array
         * @param {string} value - Delimited string
         * @returns {Array} - Array of trimmed strings
         */
        function splitField(value) {
            return value ? value.split('*').map(function(v) { return v.trim(); }) : [];
        }

        /**
         * Check whether a specific design package item is present in the line items.
         * Matches by item internal ID (item.itemId), not by product type.
         *
         * v4.3.54: Added for design package detection
         *
         * @param {Array}  lineItems    - Array of all line items from the estimate
         * @param {string} targetItemId - Internal ID to look for (e.g. '480')
         * @returns {boolean}
         */
        function hasDesignPackageItem(lineItems, targetItemId) {
            return lineItems.some(function(item) {
                return String(item.itemId) === String(targetItemId);
            });
        }

        // Reusable SVG icon strings (v4.3.42: extracted from inline usage for DRY)
        var SVG_CHECKMARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        var SVG_IMAGE_PLACEHOLDER = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
        var SVG_EXTERNAL_LINK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
        var SVG_MINI_PLACEHOLDER = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';

        // =====================================================================
        // HEATING BY ROOM - DELIMITED DATA PARSING (v3.8.0)
        // =====================================================================
        /**
         * Parse delimited room data from custom body fields
         * Fields are delimited with '*' character
         * 
         * @param {Object} roomsData - Object containing delimited room data strings
         * @returns {Array} - Array of room objects
         */
        function parseRoomsData(roomsData) {
            // Check if any data exists
            if (!roomsData.rooms && !roomsData.levels && !roomsData.areas) {
                return [];
            }
            
            // Split each field by '*' delimiter (v4.3.42: uses splitField helper)
            var rooms = splitField(roomsData.rooms);
            var levels = splitField(roomsData.levels);
            var areas = splitField(roomsData.areas);
            var solutions = splitField(roomsData.solutions);
            var controls = splitField(roomsData.controls);
            var temps = splitField(roomsData.temps);
            var manifolds = splitField(roomsData.manifolds);
            
            // If no rooms, return empty
            if (rooms.length === 0 || (rooms.length === 1 && rooms[0] === '')) {
                return [];
            }
            
            // Build array of room objects based on max length
            var roomsList = [];
            var maxLength = Math.max(
                rooms.length,
                levels.length,
                areas.length,
                solutions.length,
                controls.length,
                temps.length,
                manifolds.length
            );
            
            for (var i = 0; i < maxLength; i++) {
                // Skip if room name is empty
                if (!rooms[i] || rooms[i] === '') continue;
                
                roomsList.push({
                    name: rooms[i] || '',
                    level: levels[i] || '',
                    area: areas[i] || '',
                    solution: solutions[i] || '',
                    controls: controls[i] || '',
                    temp: temps[i] || '',
                    manifold: manifolds[i] || ''
                });
            }
            
            return roomsList;
        }

        /**
         * Render the Heating by Room table HTML
         * 
         * @param {Array} roomsList - Array of room objects from parseRoomsData
         * @returns {string} - HTML string for the table
         */
        function renderHeatingByRoomTable(roomsList) {
            if (!roomsList || roomsList.length === 0) {
                return '';
            }
            
            var html = '';
            
            // Table
            html += '<table class="rooms-table">';
            
            // Header row
            html += '<thead>';
            html += '<tr>';
            html += '<th>Room name</th>';
            html += '<th>Floor level</th>';
            html += '<th>Area</th>';
            html += '<th>System</th>';
            html += '<th>Thermostat</th>';
            html += '<th>Design temp</th>';
            html += '<th>Manifold ID</th>';
            html += '</tr>';
            html += '</thead>';
            
            // Body rows
            html += '<tbody>';
            
            for (var i = 0; i < roomsList.length; i++) {
                var room = roomsList[i];
                
                html += '<tr>';
                html += '<td class="room-name">' + escapeHtml(room.name) + '</td>';
                html += '<td>' + escapeHtml(room.level) + '</td>';
                html += '<td>' + escapeHtml(room.area) + '</td>';
                html += '<td>' + escapeHtml(room.solution) + '</td>';
                html += '<td>' + escapeHtml(room.controls) + '</td>';
                html += '<td>' + (room.temp ? escapeHtml(room.temp) + '°' : '') + '</td>';
                html += '<td>' + escapeHtml(room.manifold) + '</td>';
                html += '</tr>';
            }
            
            html += '</tbody>';
            html += '</table>';
            
            return html;
        }

        /**
         * Clean file ID value - remove quotes and whitespace
         * Handles cases where getValue returns "\"808\"" instead of just "808"
         * 
         * @param {string|number} value - Raw value from NetSuite field
         * @returns {string} - Cleaned value
         */
        function cleanFileIdValue(value) {
            if (!value) return '';
            var str = String(value);
            // Remove leading/trailing whitespace
            str = str.trim();
            // Remove all quote characters (single, double, escaped)
            str = str.replace(/['"\\]/g, '');
            // Trim again after removing quotes
            str = str.trim();
            return str;
        }

        /**
         * Get file URL from NetSuite file cabinet
         * Converts file ID or path to a proper URL for browser display
         * 
         * VERSION 3.6.5 ENHANCEMENTS:
         * - Cleans quotes from file ID values ("808" → 808)
         * - Step-by-step logging for debugging
         * - Search-based fallback if file.load() fails
         * - Better error messages
         * 
         * @param {string|number} fileIdOrPath - File internal ID or file cabinet path
         * @param {Function} debugLog - Debug logging function (optional)
         * @returns {string} - File URL or empty string if not found
         */
        function getFileUrl(fileIdOrPath, debugLog) {
            debugLog = debugLog || function() {};
            
            if (!fileIdOrPath) {
                log.debug('FILE_LOAD_EMPTY', 'No file ID/path provided');
                return '';
            }
            
            // Step 1: Clean the input value (remove quotes)
            var rawValue = String(fileIdOrPath);
            var cleanValue = cleanFileIdValue(fileIdOrPath);
            
            log.debug('FILE_LOAD_STEP1', 'Input cleaning: raw="' + rawValue + '" → clean="' + cleanValue + '"');
            debugLog('FileLoadStep1', 'Cleaned input value', { 
                raw: rawValue, 
                clean: cleanValue,
                rawLength: rawValue.length,
                cleanLength: cleanValue.length
            });
            
            if (!cleanValue) {
                log.debug('FILE_LOAD_EMPTY_AFTER_CLEAN', 'Value is empty after cleaning');
                return '';
            }
            
            try {
                var fileObj;
                
                // Step 2: Determine if it's a numeric ID
                var numericId = parseInt(cleanValue, 10);
                var isNumericId = !isNaN(numericId) && numericId > 0 && String(numericId) === cleanValue;
                
                log.debug('FILE_LOAD_STEP2', 'ID check: value="' + cleanValue + '", parsed=' + numericId + ', isNumeric=' + isNumericId);
                debugLog('FileLoadStep2', 'Checking if numeric ID', { 
                    value: cleanValue, 
                    parsedId: numericId, 
                    isNumeric: isNumericId 
                });
                
                // Step 3: Load the file
                if (isNumericId) {
                    // Load by numeric file ID
                    log.debug('FILE_LOAD_STEP3', 'Attempting file.load({ id: ' + numericId + ' })');
                    debugLog('FileLoadStep3', 'Loading file by ID', { fileId: numericId });
                    
                    fileObj = file.load({ id: numericId });
                    
                } else if (cleanValue.indexOf('/') !== -1 || cleanValue.indexOf('.') !== -1) {
                    // Load by file path
                    var filePath = cleanValue;
                    if (filePath.charAt(0) !== '/') {
                        filePath = '/' + filePath;
                    }
                    
                    log.debug('FILE_LOAD_STEP3', 'Attempting file.load({ path: "' + filePath + '" })');
                    debugLog('FileLoadStep3', 'Loading file by path', { filePath: filePath });
                    
                    fileObj = file.load({ path: filePath });
                    
                } else {
                    // Try as string ID
                    log.debug('FILE_LOAD_STEP3', 'Unknown format, trying file.load({ id: "' + cleanValue + '" })');
                    debugLog('FileLoadStep3', 'Loading file by string ID', { fileId: cleanValue });
                    
                    fileObj = file.load({ id: cleanValue });
                }
                
                // Step 4: Extract file URL and properties
                if (fileObj) {
                    var fileUrl = fileObj.url;
                    var fileName = fileObj.name;
                    var fileType = fileObj.fileType;
                    var isOnline = fileObj.isOnline;
                    
                    log.debug('FILE_LOAD_STEP4', 'File loaded - name="' + fileName + '", type=' + fileType + ', url=' + fileUrl);
                    debugLog('FileLoadStep4', 'File loaded successfully', { 
                        name: fileName,
                        type: fileType,
                        url: fileUrl,
                        isOnline: isOnline
                    });
                    
                    // Check if URL is valid
                    if (fileUrl) {
                        log.debug('FILE_LOAD_SUCCESS', 'Returning URL: ' + fileUrl);
                        debugLog('FileLoadSuccess', 'File URL ready', { url: fileUrl });
                        
                        // Note about CORS/availability
                        if (!isOnline) {
                            log.debug('FILE_CORS_NOTE', 'File may need "Available Without Login" flag in NetSuite for external access');
                            debugLog('FileLoadNote', 'File may need "Available Without Login" flag', { isOnline: isOnline });
                        }
                        
                        return fileUrl;
                    } else {
                        log.debug('FILE_LOAD_NO_URL', 'File loaded but URL is empty/null');
                        debugLog('FileLoadWarning', 'File loaded but URL is empty', { name: fileName });
                    }
                }
                
            } catch (loadError) {
                log.debug('FILE_LOAD_ERROR', 
                    'file.load() failed for "' + cleanValue + '": ' + loadError.message);
                debugLog('FileLoadError', 'file.load() failed', { 
                    input: cleanValue, 
                    error: loadError.message,
                    errorName: loadError.name
                });
                
                // Step 5: Fallback - try search for the file
                if (!isNaN(parseInt(cleanValue, 10))) {
                    try {
                        log.debug('FILE_LOAD_FALLBACK', 'Trying search fallback for file ID: ' + cleanValue);
                        debugLog('FileLoadFallback', 'Attempting file search', { fileId: cleanValue });
                        
                        var fileSearch = search.create({
                            type: 'file',
                            filters: [
                                ['internalid', 'is', parseInt(cleanValue, 10)]
                            ],
                            columns: ['name', 'url']
                        });
                        
                        var searchResults = fileSearch.run().getRange({ start: 0, end: 1 });
                        
                        if (searchResults && searchResults.length > 0) {
                            var searchUrl = searchResults[0].getValue({ name: 'url' });
                            var searchName = searchResults[0].getValue({ name: 'name' });
                            
                            log.debug('FILE_SEARCH_RESULT', 'Found via search: name="' + searchName + '", url=' + searchUrl);
                            debugLog('FileSearchSuccess', 'Found file via search', { 
                                name: searchName, 
                                url: searchUrl 
                            });
                            
                            if (searchUrl) {
                                return searchUrl;
                            }
                        } else {
                            log.debug('FILE_SEARCH_EMPTY', 'No results from file search');
                            debugLog('FileSearchEmpty', 'No search results', { fileId: cleanValue });
                        }
                        
                    } catch (searchError) {
                        log.debug('FILE_SEARCH_ERROR', 'File search failed: ' + searchError.message);
                        debugLog('FileSearchError', 'Search fallback failed', { error: searchError.message });
                    }
                }
            }
            
            log.debug('FILE_LOAD_FINAL', 'No URL resolved for: ' + rawValue);
            debugLog('FileLoadFailed', 'Could not resolve file URL', { input: rawValue });
            return '';
        }

        // =====================================================================
        // THERMOSTAT OPTIONS ITEM LOADER (v4.3.9)
        // =====================================================================
        /**
         * Load thermostat option items by item name/ID
         * @param {Array} itemIds - Array of item name/IDs to load (e.g., ['DSSB5-C', 'Neostatwv2-C'])
         * @param {Array} displayedItemIds - Array of item internal IDs already displayed in main section
         * @param {Function} debugLog - Debug logging function
         * @returns {Array} Array of item objects with product name, description, features, image
         */
        function loadThermostatOptionItems(itemIds, displayedItemIds, debugLog) {
            var items = [];
            
            if (!itemIds || itemIds.length === 0) {
                return items;
            }
            
            debugLog('ThermostatOptions', 'Loading thermostat option items', { 
                itemIds: itemIds, 
                displayedItemIds: displayedItemIds 
            });
            
            try {
                // Create search to find items by name/itemid
                // Build filter expression: itemid IS value1 OR itemid IS value2 OR ...
                var filterExpression = [];
                itemIds.forEach(function(id, index) {
                    if (index > 0) {
                        filterExpression.push('OR');
                    }
                    filterExpression.push(['itemid', 'is', id]);
                });
                
                debugLog('ThermostatOptions', 'Search filter expression', { 
                    filterExpression: JSON.stringify(filterExpression) 
                });
                
                var itemSearch = search.create({
                    type: search.Type.ITEM,
                    filters: filterExpression,
                    columns: [
                        search.createColumn({ name: 'itemid' }),
                        search.createColumn({ name: 'displayname' }),
                        search.createColumn({ name: 'description' }),
                        search.createColumn({ name: 'custitem_quote_product_name' }),
                        search.createColumn({ name: 'custitem_quote_description' }),
                        search.createColumn({ name: 'custitem_quote_prod_visual_1' }),
                        search.createColumn({ name: 'custitem_quote_fab_1' }),
                        search.createColumn({ name: 'custitem_quote_fab_2' }),
                        search.createColumn({ name: 'custitem_quote_fab_3' }),
                        search.createColumn({ name: 'custitem_quote_fab_4' }),
                        search.createColumn({ name: 'custitem_quote_fab_5' }),
                        search.createColumn({ name: 'custitem_quote_fab_6' }),
                        search.createColumn({ name: 'custitem_prod_info_link' })
                    ]
                });
                
                itemSearch.run().each(function(result) {
                    var internalId = result.id;
                    var itemId = result.getValue({ name: 'itemid' });
                    
                    // Skip if this item is already displayed in the main UFH section
                    if (displayedItemIds && displayedItemIds.indexOf(String(internalId)) !== -1) {
                        debugLog('ThermostatOptions', 'Skipping item - already displayed', { 
                            itemId: itemId, 
                            internalId: internalId 
                        });
                        return true; // Continue to next result
                    }
                    
                    // Get product name (prefer custitem_quote_product_name, fallback to displayname)
                    var productName = result.getValue({ name: 'custitem_quote_product_name' }) ||
                                     result.getValue({ name: 'displayname' }) ||
                                     itemId;
                    
                    // Get description (prefer custitem_quote_description, fallback to description)
                    var description = result.getValue({ name: 'custitem_quote_description' }) ||
                                     result.getValue({ name: 'description' }) || '';
                    
                    // Get features (fab_1 through fab_6)
                    var features = [];
                    for (var f = 1; f <= 6; f++) {
                        var fab = result.getValue({ name: 'custitem_quote_fab_' + f });
                        if (fab) features.push(fab);
                    }
                    
                    // Get image
                    var imageRef = result.getValue({ name: 'custitem_quote_prod_visual_1' });
                    var imageUrl = '';
                    if (imageRef) {
                        try {
                            imageUrl = getFileUrl(imageRef, debugLog);
                        } catch (e) {
                            debugLog('ThermostatOptions', 'Image load error', { itemId: itemId, error: e.message });
                        }
                    }
                    
                    // v4.3.40: Get product info link
                    var productInfoLink = result.getValue({ name: 'custitem_prod_info_link' }) || '';
                    
                    items.push({
                        internalId: internalId,
                        itemId: itemId,
                        productName: productName,
                        description: description,
                        features: features,
                        imageUrl: imageUrl,
                        isRecommended: (itemId === RECOMMENDED_ITEM_ID),
                        productInfoLink: productInfoLink
                    });
                    
                    debugLog('ThermostatOptions', 'Loaded item', { 
                        itemId: itemId, 
                        productName: productName,
                        featuresCount: features.length,
                        hasImage: !!imageUrl,
                        isRecommended: (itemId === RECOMMENDED_ITEM_ID)
                    });
                    
                    return true; // Continue to next result
                });
                
            } catch (e) {
                log.error('THERMOSTAT_OPTIONS_ERROR', 'Failed to load thermostat option items: ' + e.message);
                debugLog('ThermostatOptions', 'Search error', { error: e.message });
            }
            
            debugLog('ThermostatOptions', 'Loaded items complete', { count: items.length });
            return items;
        }
        
        /**
         * Render a mini product card for thermostat options section
         * @param {Object} item - Item object with productName, description, features, imageUrl, isRecommended
         * @returns {string} HTML string for the mini product card
         */
        // v4.3.11: Added debug logging for benefits display troubleshooting
        function renderMiniProductCard(item) {
            var html = '';
            var cardClass = 'mini-product-card' + (item.isRecommended ? ' recommended' : '');
            
            // v4.3.11: Debug logging for benefits/features
            log.debug('renderMiniProductCard', 'Rendering card: ' + item.productName + ', features: ' + (item.features ? item.features.length : 0) + ', description length: ' + (item.description ? item.description.length : 0));
            
            html += '<div class="' + cardClass + '">\n';
            
            // Recommended badge
            if (item.isRecommended) {
                html += '    <span class="mini-card-recommended-badge">Recommended</span>\n';
            }
            
            // Image
            if (item.imageUrl) {
                html += '    <div class="mini-card-image">\n';
                html += '        <img src="' + escapeHtml(item.imageUrl) + '" alt="' + escapeHtml(item.productName) + '" onerror="this.style.display=\'none\'; this.parentElement.innerHTML=\'<div class=mini-card-image-placeholder><svg width=32 height=32 viewBox=0 0 24 24 fill=none stroke=#ccc stroke-width=1><rect x=3 y=3 width=18 height=18 rx=2 ry=2/><circle cx=8.5 cy=8.5 r=1.5/><polyline points=21 15 16 10 5 21/></svg></div>\';">\n';
                html += '    </div>\n';
            } else {
                html += '    <div class="mini-card-image">\n';
                html += '        <div class="mini-card-image-placeholder">' + SVG_MINI_PLACEHOLDER + '</div>\n';
                html += '    </div>\n';
            }
            
            // Title
            html += '    <h5 class="mini-card-title">' + escapeHtml(item.productName) + '</h5>\n';
            
            // Description (truncated)
            if (item.description) {
                html += '    <p class="mini-card-description">' + escapeHtml(item.description) + '</p>\n';
            }
            
            // Benefits (first 3 only)
            if (item.features && item.features.length > 0) {
                html += '    <ul class="mini-card-benefits">\n';
                var maxFeatures = Math.min(item.features.length, 3);
                for (var i = 0; i < maxFeatures; i++) {
                    html += '        <li>' + escapeHtml(item.features[i]) + '</li>\n';
                }
                html += '    </ul>\n';
            }
            
            // View more link — v4.3.40: only show if product info link exists
            if (item.productInfoLink) {
                html += '    <a href="' + escapeHtml(item.productInfoLink) + '" target="_blank" rel="noopener noreferrer" class="mini-card-link">View more details ' + SVG_EXTERNAL_LINK + '</a>\n';
            }
            
            html += '</div>\n';
            
            return html;
        }

        // =====================================================================
        // MAIN ENTRY POINT
        // =====================================================================
        function onRequest(context) {
            const startTime = Date.now();
            
            // Server-side debug logging function (logs to NetSuite execution log)
            function debugLog(category, message, data) {
                log.debug(category, message + (data ? ': ' + JSON.stringify(data) : ''));
            }
            
            try {
                log.audit('Quote Suitelet', 'Request received: ' + context.request.method);
                debugLog('Request', 'Suitelet request received', { method: context.request.method });
                
                if (context.request.method !== 'GET') {
                    throw createError('INVALID_METHOD', 'Only GET requests are supported');
                }

                const quoteId = context.request.parameters.quoteid || 
                               context.request.parameters.quoteId ||
                               context.request.parameters.id;
                
                // v4.0.0: Support mode parameter for HTML generation
                const mode = context.request.parameters.mode || 'view';

                debugLog('Parameters', 'URL parameters parsed', { quoteId: quoteId, mode: mode });

                if (!quoteId) {
                    if (mode === 'generate') {
                        context.response.write(JSON.stringify({ success: false, error: 'Quote ID is required' }));
                    } else {
                        context.response.write(renderErrorPage('Missing Quote ID', 
                            'Please provide a valid quote ID in the URL (e.g., ?quoteid=12345)'));
                    }
                    return;
                }

                if (isNaN(parseInt(quoteId, 10))) {
                    if (mode === 'generate') {
                        context.response.write(JSON.stringify({ success: false, error: 'Invalid Quote ID format' }));
                    } else {
                        context.response.write(renderErrorPage('Invalid Quote ID', 
                            'The quote ID must be a valid number.'));
                    }
                    return;
                }

                // v4.3.47: Extract pricing parameters if provided by client script
                // These bypass database read-back timing issues entirely
                var pricingOverrides = null;
                var p_subtotal = context.request.parameters.p_subtotal;
                var p_taxtotal = context.request.parameters.p_taxtotal;
                var p_total = context.request.parameters.p_total;
                var p_discounttotal = context.request.parameters.p_discounttotal;
                
                if (p_subtotal !== undefined && p_subtotal !== null && p_subtotal !== '') {
                    pricingOverrides = {
                        subtotal: p_subtotal,
                        taxtotal: p_taxtotal || '0',
                        total: p_total || '0',
                        discounttotal: p_discounttotal || '0'
                    };
                    log.audit('Quote Suitelet', 'v4.3.47 Pricing overrides received from client script: ' + JSON.stringify(pricingOverrides));
                    debugLog('Parameters', 'v4.3.47 Pricing overrides from client script', pricingOverrides);
                } else {
                    log.audit('Quote Suitelet', 'v4.3.47 No pricing overrides - will use database values');
                    debugLog('Parameters', 'v4.3.47 No pricing overrides provided');
                }

                // v4.0.0: Handle generate mode - create and save static HTML file
                if (mode === 'generate') {
                    var result = generateAndSaveHTML(quoteId, debugLog, pricingOverrides);
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify(result));
                    return;
                }

                debugLog('Loading', 'Starting quote data load', { quoteId: quoteId });
                const quoteData = loadQuoteData(quoteId, debugLog);
                
                debugLog('Rendering', 'Starting page render', { 
                    lineItemCount: quoteData.lineItems.length,
                    hasRooms: quoteData.hasRooms,
                    hasPerformance: quoteData.hasPerformance
                });
                
                const html = renderQuotePage(quoteData);
                
                context.response.write(html);

                const elapsed = Date.now() - startTime;
                log.audit('Quote Suitelet', 'Quote ' + quoteId + ' rendered successfully in ' + elapsed + 'ms');

            } catch (e) {
                log.error('Quote Suitelet Error', e.message + '\n' + e.stack);
                debugLog('Error', 'Exception caught', { name: e.name, message: e.message });
                
                // Check if this is a generate mode request
                var requestMode = context.request.parameters.mode || 'view';
                if (requestMode === 'generate') {
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify({ success: false, error: e.message }));
                    return;
                }
                
                if (e.name === 'RCRD_DSNT_EXIST' || e.name === 'INVALID_RECORD_ID') {
                    context.response.write(renderErrorPage('Quote Not Found', 
                        'The requested quote could not be found. Please check the quote ID and try again.'));
                } else {
                    context.response.write(renderErrorPage('Error Loading Quote', 
                        'An error occurred while loading your quote. Please contact your account manager for assistance.'));
                }
            }
        }

        // =====================================================================
        // HTML GENERATION AND STORAGE (v4.0.0)
        // =====================================================================
        
        /**
         * Generate static HTML and save to File Cabinet
         * @param {string|number} quoteId - The internal ID of the quote
         * @param {function} debugLog - Debug logging function
         * @returns {Object} Result object with success, url, fileId or error
         */
        function generateAndSaveHTML(quoteId, debugLogOrOptions, pricingOverrides) {
            // v4.3.51: Support both old signature (quoteId, debugLog, pricingOverrides)
            // and new signature (quoteId, options) for backward compatibility
            var options = {};
            var debugLog = function() {};
            
            if (typeof debugLogOrOptions === 'function') {
                // Old signature: generateAndSaveHTML(quoteId, debugLog, pricingOverrides)
                debugLog = debugLogOrOptions;
                pricingOverrides = pricingOverrides || null;
            } else if (debugLogOrOptions && typeof debugLogOrOptions === 'object') {
                // New signature: generateAndSaveHTML(quoteId, options)
                options = debugLogOrOptions;
                debugLog = options.debugLog || function() {};
                pricingOverrides = options.pricingOverrides || null;
            } else {
                pricingOverrides = pricingOverrides || null;
            }
            
            try {
                log.audit('HTML Generation', 'Starting HTML generation for quote: ' + quoteId + 
                    (pricingOverrides ? ' (with pricing overrides from client)' : ' (using database values)'));
                debugLog('Generate', 'Starting HTML generation', { 
                    quoteId: quoteId, 
                    hasPricingOverrides: !!pricingOverrides 
                });
                
                // Check if folder ID is configured
                if (!QUOTE_HTML_FOLDER_ID) {
                    throw error.create({
                        name: 'CONFIGURATION_ERROR',
                        message: 'QUOTE_HTML_FOLDER_ID is not configured. Please set the folder ID in the script.'
                    });
                }
                
                // Load quote data, passing pricing overrides if available
                var quoteData = loadQuoteData(quoteId, debugLog, pricingOverrides);
                debugLog('Generate', 'Quote data loaded', { tranId: quoteData.tranId });
                
                // v4.3.46: Log the pricing data that will be used in HTML generation
                log.audit('HTML Generation', 'v4.3.46 Pricing in quoteData: ' +
                    'subtotal=' + quoteData.header.subtotal + 
                    ', total=' + quoteData.header.total + 
                    ', discount=' + quoteData.header.discountTotal + 
                    ', hasDiscount=' + quoteData.header.hasDiscount);
                debugLog('Generate', 'v4.3.46 Pricing values for HTML', {
                    subtotal: quoteData.header.subtotal,
                    total: quoteData.header.total,
                    discountTotal: quoteData.header.discountTotal,
                    hasDiscount: quoteData.header.hasDiscount
                });
                
                // Generate complete HTML
                var html = renderQuotePage(quoteData);
                debugLog('Generate', 'HTML rendered', { length: html.length });
                
                // v4.3.49: Use opportunity ID from quoteData for filename
                var opportunityId = quoteData.opportunityId || '';
                debugLog('Generate', 'Opportunity ID for filename', { opportunityId: opportunityId });
                
                // v4.3.49: TIMESTAMPED filename for versioned storage
                // Format: quote_{quoteId}_{opportunityId}_{timestamp}.html
                // The timestamp ensures each regeneration creates a new file.
                // The Quote Viewer Suitelet serves the latest version via a stable proxy URL.
                var timestamp = new Date().getTime();
                var filePrefix = 'quote_' + quoteId + (opportunityId ? '_' + opportunityId : '');
                var fileName = filePrefix + '_' + timestamp + '.html';
                debugLog('Generate', 'Using timestamped filename', { fileName: fileName, timestamp: timestamp });
                
                // v4.3.49: Create new file (no delete needed — each version gets a unique name)
                var fileId = null;
                try {
                    log.audit('FILE_SAVE_STEP1', 'v4.3.49 Creating new timestamped file: ' + fileName + ', content length: ' + html.length);
                    debugLog('Generate', 'Step 1: Creating new timestamped file', { fileName: fileName, contentLength: html.length });
                    
                    var fileObj = file.create({
                        name: fileName,
                        fileType: file.Type.HTMLDOC,
                        contents: html,
                        folder: QUOTE_HTML_FOLDER_ID,
                        isOnline: true
                    });
                    
                    fileId = fileObj.save();
                    
                    log.audit('FILE_SAVE_STEP2', 'v4.3.49 New file created successfully with ID: ' + fileId);
                    debugLog('Generate', 'Step 2: New file created', { fileId: fileId, fileName: fileName });
                    
                } catch (fileError) {
                    log.error('FILE_SAVE_ERROR', 'v4.3.49 File save failed: ' + fileError.message + ' | Stack: ' + (fileError.stack || 'N/A'));
                    debugLog('Generate', 'File save failed, attempting fallback', { error: fileError.message });
                    
                    try {
                        var fallbackFile = file.create({
                            name: fileName,
                            fileType: file.Type.HTMLDOC,
                            contents: html,
                            folder: QUOTE_HTML_FOLDER_ID,
                            isOnline: true
                        });
                        fileId = fallbackFile.save();
                        log.audit('FILE_SAVE_FALLBACK', 'v4.3.49 Fallback file created with ID: ' + fileId);
                        debugLog('Generate', 'Fallback file created', { fileId: fileId });
                    } catch (fallbackError) {
                        log.error('FILE_SAVE_FALLBACK_ERROR', 'v4.3.49 Fallback create also failed: ' + fallbackError.message);
                        throw error.create({
                            name: 'FILE_SAVE_FAILED',
                            message: 'Could not save HTML file after multiple attempts: ' + fallbackError.message
                        });
                    }
                }
                
                // v4.3.53: Determine URL strategy based on options
                // Default changed back to true (proxy URLs) now that the Quote Viewer
                // deployment has correct permissions:
                //   - Audience: All Internal Roles + All External Roles
                //   - Available Without Login: Yes
                //   - Execute As Role: Administrator
                // Proxy URLs are stable and don't change when quotes are regenerated.
                var shouldUseProxy = (options.useProxyUrl !== undefined) ? options.useProxyUrl : true;
                var calledFrom = options.calledFrom || 'unknown';
                
                log.audit('URL_STRATEGY', 'v4.3.53 useProxyUrl=' + shouldUseProxy + ', calledFrom=' + calledFrom);
                
                var VIEWER_SCRIPT_ID = 'customscript_nuheat_quote_viewer';
                var VIEWER_DEPLOYMENT_ID = 'customdeploy_nuheat_quote_viewer';
                
                var finalUrl = '';
                var urlType = 'unknown';
                
                if (shouldUseProxy) {
                    // v4.3.49: Generate STABLE PROXY URL using the Quote Viewer Suitelet
                    // This URL never changes — the viewer Suitelet always serves the latest file.
                    try {
                        finalUrl = url.resolveScript({
                            scriptId: VIEWER_SCRIPT_ID,
                            deploymentId: VIEWER_DEPLOYMENT_ID,
                            returnExternalUrl: true,
                            params: {
                                quote: quoteId,
                                opp: opportunityId
                            }
                        });
                        urlType = 'proxy';
                        
                        log.audit('PROXY_URL', 'v4.3.51 Generated stable proxy URL: ' + finalUrl);
                        debugLog('Generate', 'Proxy URL generated', { proxyUrl: finalUrl });
                    } catch (urlError) {
                        // Fallback: if viewer Suitelet isn't deployed yet, use direct file URL
                        log.error('PROXY_URL_ERROR', 'v4.3.51 Could not generate proxy URL: ' + urlError.message + 
                            '. Falling back to direct file URL.');
                        debugLog('Generate', 'Proxy URL failed, falling back to direct URL', { error: urlError.message });
                        shouldUseProxy = false; // Fall through to direct URL below
                    }
                }
                
                if (!shouldUseProxy || !finalUrl) {
                    // v4.3.51: Direct File Cabinet URL — always works if folder has correct permissions
                    // Use this when:
                    //   - useProxyUrl is false (explicit choice to avoid permissions issues)
                    //   - Proxy URL generation failed (viewer Suitelet not deployed)
                    var savedFile = file.load({ id: fileId });
                    var fileUrl = savedFile.url;
                    var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
                    finalUrl = 'https://' + domain + fileUrl;
                    urlType = 'direct';
                    
                    log.audit('DIRECT_URL', 'v4.3.51 Using direct File Cabinet URL: ' + finalUrl);
                    debugLog('Generate', 'Direct file URL generated', { url: finalUrl });
                }
                
                log.audit('HTML Generation', 'v4.3.51 File saved with ID ' + fileId + ', content length: ' + html.length + ', URL type: ' + urlType);
                
                // v4.3.51: Store the URL in custbody_test_new_quote
                // URL type depends on useProxyUrl setting (proxy = stable, direct = changes on regen)
                record.submitFields({
                    type: record.Type.ESTIMATE,
                    id: quoteId,
                    values: {
                        'custbody_test_new_quote': finalUrl
                    },
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    }
                });
                debugLog('Generate', 'Quote record updated with ' + urlType + ' URL');
                
                // v4.3.49: Cleanup old file versions (keep last 5)
                try {
                    cleanupOldFiles(filePrefix, fileId, debugLog);
                } catch (cleanupError) {
                    // Cleanup failure is non-critical — log and continue
                    log.error('FILE_CLEANUP_ERROR', 'v4.3.49 Cleanup failed (non-critical): ' + cleanupError.message);
                    debugLog('Generate', 'Cleanup failed (non-critical)', { error: cleanupError.message });
                }
                
                log.audit('HTML Generation', 'v4.3.51 Successfully generated HTML for quote ' + quoteId + ': ' + finalUrl + ' (' + urlType + ')');
                
                return {
                    success: true,
                    url: finalUrl,
                    urlType: urlType,
                    fileId: fileId,
                    fileName: fileName,
                    quoteId: quoteId
                };
                
            } catch (e) {
                log.error('HTML Generation Error', 'Quote ' + quoteId + ': ' + e.message);
                debugLog('Generate', 'Error generating HTML', { error: e.message });
                
                return {
                    success: false,
                    error: e.message,
                    quoteId: quoteId
                };
            }
        }

        // =====================================================================
        // FILE CLEANUP (v4.3.49)
        // =====================================================================
        
        /**
         * Cleanup old file versions — keeps the last MAX_VERSIONS files per quote.
         * Deletes older versions to prevent unbounded file growth in File Cabinet.
         * 
         * @param {string} filePrefix - The file prefix (e.g., "quote_12345_67890")
         * @param {number} currentFileId - The file ID just created (will be preserved)
         * @param {function} debugLog - Debug logging function
         */
        var MAX_FILE_VERSIONS = 5;
        
        function cleanupOldFiles(filePrefix, currentFileId, debugLog) {
            debugLog = debugLog || function() {};
            
            log.audit('FILE_CLEANUP', 'v4.3.49 Starting cleanup for prefix: ' + filePrefix + ' (keeping last ' + MAX_FILE_VERSIONS + ')');
            
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
            
            var allFiles = [];
            fileSearch.run().each(function(result) {
                allFiles.push({
                    id: result.getValue('internalid'),
                    name: result.getValue('name')
                });
                return true;
            });
            
            log.audit('FILE_CLEANUP', 'v4.3.49 Found ' + allFiles.length + ' total file(s) for prefix: ' + filePrefix);
            debugLog('Cleanup', 'Files found', { total: allFiles.length, prefix: filePrefix });
            
            // Files are sorted by name DESC (newest first due to timestamp in name)
            // Keep the first MAX_FILE_VERSIONS, delete the rest
            if (allFiles.length <= MAX_FILE_VERSIONS) {
                log.audit('FILE_CLEANUP', 'v4.3.49 No cleanup needed (' + allFiles.length + ' <= ' + MAX_FILE_VERSIONS + ')');
                debugLog('Cleanup', 'No cleanup needed', { count: allFiles.length, max: MAX_FILE_VERSIONS });
                return;
            }
            
            var filesToDelete = allFiles.slice(MAX_FILE_VERSIONS);
            log.audit('FILE_CLEANUP', 'v4.3.49 Deleting ' + filesToDelete.length + ' old file(s)');
            debugLog('Cleanup', 'Deleting old files', { count: filesToDelete.length });
            
            var deleted = 0;
            for (var i = 0; i < filesToDelete.length; i++) {
                try {
                    // Safety: never delete the file we just created
                    if (String(filesToDelete[i].id) === String(currentFileId)) {
                        log.audit('FILE_CLEANUP', 'v4.3.49 Skipping current file ID: ' + filesToDelete[i].id);
                        continue;
                    }
                    
                    file['delete']({ id: filesToDelete[i].id });
                    deleted++;
                    log.audit('FILE_CLEANUP', 'v4.3.49 Deleted old file: ' + filesToDelete[i].name + ' (ID: ' + filesToDelete[i].id + ')');
                } catch (deleteError) {
                    log.error('FILE_CLEANUP_DELETE_ERROR', 'v4.3.49 Failed to delete ' + filesToDelete[i].name + ': ' + deleteError.message);
                    // Continue — don't let one failure stop the rest
                }
            }
            
            log.audit('FILE_CLEANUP', 'v4.3.49 Cleanup complete: deleted ' + deleted + ' of ' + filesToDelete.length + ' old file(s)');
            debugLog('Cleanup', 'Cleanup complete', { deleted: deleted, attempted: filesToDelete.length });
        }

        // =====================================================================
        // DATA LOADING FUNCTIONS
        // =====================================================================
function loadQuoteData(quoteId, debugLog, pricingOverrides) {
            debugLog = debugLog || function() {}; // Fallback for no debug
            pricingOverrides = pricingOverrides || null;
            
            log.debug('Loading Quote', 'Quote ID: ' + quoteId + ' (v4.3.50 fresh-load)');
            debugLog('LoadQuote', 'Loading estimate record', { 
                quoteId: quoteId, 
                version: SCRIPT_VERSION,
                hasPricingOverrides: !!pricingOverrides
            });

            // v4.3.50: STALE DATA FIX (SIMPLIFIED)
            // Priority order for pricing values:
            //   TIER 1: pricingOverrides (passed from client script URL params - always fresh)
            //   TIER 2: record.load() values (used when no overrides, e.g. UE script or direct URL)
            //
            // NOTE: search.lookupFields() was removed in v4.3.50 because 'subtotal', 'total',
            // 'taxtotal', 'discounttotal' are NOT valid search columns on Estimate records
            // in NetSuite. They caused SSS_INVALID_SRCH_COL errors. These computed fields
            // can only be accessed via record.load() or passed as parameters.
            
            var freshPricingFields = {};
            
            if (pricingOverrides) {
                // TIER 1: Use pricing values passed from client script
                // These are read from record.load() in the CLIENT context (after save),
                // which is a separate execution context and always has fresh data.
                freshPricingFields = {
                    subtotal: pricingOverrides.subtotal,
                    taxtotal: pricingOverrides.taxtotal,
                    total: pricingOverrides.total,
                    discounttotal: pricingOverrides.discounttotal
                };
                log.audit('LoadQuote', 'v4.3.50 TIER 1: Using pricing overrides from client script (most reliable): ' + JSON.stringify(freshPricingFields));
                debugLog('LoadQuote', 'v4.3.50 TIER 1: Pricing overrides from client script', freshPricingFields);
            } else {
                // TIER 2: No overrides available — will use record.load() values below
                // This happens when called from UE script, direct URL access, or Quote Viewer proxy
                log.audit('LoadQuote', 'v4.3.50 TIER 2: No pricing overrides — will use record.load() values');
                debugLog('LoadQuote', 'v4.3.50 TIER 2: No pricing overrides, using record.load()', { 
                    reason: 'Called without client script parameters (UE script, direct URL, or viewer proxy)'
                });
            }

            const estimate = record.load({
                type: record.Type.ESTIMATE,
                id: quoteId,
                isDynamic: false
            });
            
            // v4.3.50: Log record.load values for comparison/diagnostics
            var recordLoadPricing = {
                subtotal: estimate.getValue({ fieldId: 'subtotal' }),
                taxtotal: estimate.getValue({ fieldId: 'taxtotal' }),
                total: estimate.getValue({ fieldId: 'total' }),
                discounttotal: estimate.getValue({ fieldId: 'discounttotal' })
            };
            log.audit('LoadQuote', 'v4.3.50 record.load pricing: ' + JSON.stringify(recordLoadPricing));
            debugLog('LoadQuote', 'record.load pricing', recordLoadPricing);
            
            // v4.3.50: Detect stale data by comparing client overrides vs record.load
            if (pricingOverrides && freshPricingFields.discounttotal !== undefined) {
                var freshDiscount = String(freshPricingFields.discounttotal || '0');
                var recDiscount = String(recordLoadPricing.discounttotal || '0');
                if (freshDiscount !== recDiscount) {
                    log.audit('LoadQuote', 'v4.3.50 STALE DATA DETECTED! ' + 
                        'Client override discount=' + freshDiscount + 
                        ' vs record.load discount=' + recDiscount + '. Using client override value.');
                    debugLog('LoadQuote', 'STALE DATA DETECTED - using client override values', {
                        source: 'client script overrides',
                        freshDiscount: freshDiscount,
                        recordDiscount: recDiscount
                    });
                }
            }

            debugLog('LoadQuote', 'Estimate loaded successfully', { 
                tranId: estimate.getValue({ fieldId: 'tranid' }),
                entity: estimate.getText({ fieldId: 'entity' })
            });

            // v4.3.43: Extract opportunity ID for stable file naming
            var opportunityId = estimate.getValue({ fieldId: 'opportunity' }) || 
                               estimate.getValue({ fieldId: 'createdfrom' }) || '';
            debugLog('LoadQuote', 'Opportunity ID extracted', { opportunityId: opportunityId });

            const headerData = extractHeaderData(estimate, debugLog, freshPricingFields);
            debugLog('LoadQuote', 'Header data extracted', {
                customerName: headerData.customerName,
                total: headerData.total,
                discountTotal: headerData.discountTotal,
                hasDiscount: headerData.hasDiscount
            });
            
            const lineItems = extractLineItems(estimate, debugLog);
            debugLog('LoadQuote', 'Line items extracted', { count: lineItems.length });
            
            const groupedItems = groupItemsByCategory(lineItems, debugLog);
            debugLog('LoadQuote', 'Items grouped by category', {
                UFH: groupedItems['Underfloor heating'].length,
                HP: groupedItems['Heat Pump'].length,
                Solar: groupedItems['Solar thermal'].length,
                Commissioning: groupedItems['Commissioning'].length,
                Other: groupedItems['Other'].length
            });
            
            const systemInfo = detectMultiSystem(lineItems, debugLog);
            debugLog('LoadQuote', 'Multi-system detection complete', {
                count: systemInfo.count,
                isMultiSystem: systemInfo.isMultiSystem
            });
            
            // Updated field mappings per Quote content and logic.xlsx
            // v3.8.0 - Read delimited room data fields for "Heating by room" table
            var roomsDataRaw = {
                rooms: estimate.getValue({ fieldId: 'custbody_rooms_list' }) || '',
                levels: estimate.getValue({ fieldId: 'custbody_level_list' }) || '',
                areas: estimate.getValue({ fieldId: 'custbody_sq_metres_list' }) || '',
                solutions: estimate.getValue({ fieldId: 'custbody_floor_cons_list' }) || '',
                controls: estimate.getValue({ fieldId: 'custbody_thermostat_list' }) || '',
                temps: estimate.getValue({ fieldId: 'custbody_design_temp_list' }) || '',
                manifolds: estimate.getValue({ fieldId: 'custbody_manifold_number_list' }) || ''
            };
            
            debugLog('LoadQuote', 'Rooms data raw values', {
                rooms: roomsDataRaw.rooms,
                levels: roomsDataRaw.levels,
                areas: roomsDataRaw.areas,
                solutions: roomsDataRaw.solutions,
                controls: roomsDataRaw.controls,
                temps: roomsDataRaw.temps,
                manifolds: roomsDataRaw.manifolds
            });
            
            // Parse delimited room data into array of room objects
            var roomsList = parseRoomsData(roomsDataRaw);
            debugLog('LoadQuote', 'Parsed rooms list', {
                roomCount: roomsList.length,
                rooms: roomsList.map(function(r) { return r.name; })
            });
            
            // Legacy HTML fields (fallback if delimited fields are empty)
            const roomsHtml = estimate.getValue({ fieldId: 'custbody_qdt_rooms_table' }) || 
                             estimate.getValue({ fieldId: 'custbody_rooms_html' }) || '';
            const performanceHtml = estimate.getValue({ fieldId: 'custbody_qdt_performance' }) || '';
            const estimatorNotes = estimate.getValue({ fieldId: 'custbody_fm_estimator_notes' }) || '';
            
            // v4.2.0: Important Notes fields (delimited by '*')
            const quoteNoteTitles = estimate.getValue({ fieldId: 'custbody_quote_note_title' }) || '';
            const quoteNoteDescriptions = estimate.getValue({ fieldId: 'custbody_quote_note_description' }) || '';
            
            // v4.1.7: Heat pump energy performance fields
            const heatingScop = estimate.getValue({ fieldId: 'custbody_heating_scop' }) || '';
            const hotWaterScop = estimate.getValue({ fieldId: 'custbody_hot_water_scop' }) || '';
            const heatLoad = estimate.getValue({ fieldId: 'custbody_hp_building_energy_req' }) || '';
            const heatingRequirement = estimate.getValue({ fieldId: 'custbody_ann_htg_demand' }) || '';
            const heatOutput = estimate.getValue({ fieldId: 'custbody_hp_energy_delivered' }) || '';
            const electricityUsed = estimate.getValue({ fieldId: 'custbody_hp_electricity_consumed' }) || '';
            const backupEnergy = estimate.getValue({ fieldId: 'custbody_hp_supp_power' }) || '';
            const reheatTime = estimate.getValue({ fieldId: 'custbody_hwc_typ_reheat_time' }) || '';
            const mcsCertNo = estimate.getValue({ fieldId: 'custbody_mcs_cert_no' }) || '';
            const bivalentPoint = estimate.getValue({ fieldId: 'custbody_bvt3' }) || '-1.2';
            
            debugLog('LoadQuote', 'Custom body fields loaded', {
                roomsListCount: roomsList.length,
                hasRoomsHtml: roomsHtml.length > 0,
                roomsHtmlLength: roomsHtml.length,
                hasPerformanceHtml: performanceHtml.length > 0,
                performanceHtmlLength: performanceHtml.length,
                hasEstimatorNotes: estimatorNotes.length > 0
            });
            
            const salesRep = loadSalesRepData(estimate, debugLog);
            debugLog('LoadQuote', 'Sales rep data loaded', {
                name: salesRep.name,
                hasPhoto: salesRep.hasPhoto
            });
            
            const categoryTotals = calculateCategoryTotals(groupedItems, headerData.currencySymbol, estimate);

            // Determine if we have rooms data (prefer new delimited format, fallback to legacy HTML)
            var hasRoomsData = roomsList.length > 0 || (roomsHtml && roomsHtml.trim().length > 0);
            
            // v4.1.7: Heat pump performance data object
            const heatPumpPerformance = {
                heatingScop: heatingScop,
                hotWaterScop: hotWaterScop,
                heatLoad: heatLoad,
                heatingRequirement: heatingRequirement,
                heatOutput: heatOutput,
                electricityUsed: electricityUsed,
                backupEnergy: backupEnergy,
                reheatTime: reheatTime,
                mcsCertNo: mcsCertNo,
                bivalentPoint: bivalentPoint
            };
            
            // Check if we have any heat pump performance data
            var hasHeatPumpPerformanceData = heatingScop || hotWaterScop || heatLoad || heatingRequirement || heatOutput || electricityUsed || backupEnergy;
            
            // v4.2.0: Parse Important Notes (delimited by '*')
            var noteTitlesArray = quoteNoteTitles ? quoteNoteTitles.split('*').map(function(title) { return title.trim(); }).filter(function(t) { return t.length > 0; }) : [];
            var noteDescriptionsArray = quoteNoteDescriptions ? quoteNoteDescriptions.split('*').map(function(desc) { return desc.trim(); }).filter(function(d) { return d.length > 0; }) : [];
            var hasImportantNotes = noteTitlesArray.length > 0 && noteDescriptionsArray.length > 0;
            
            const quoteData = {
                id: quoteId,
                opportunityId: opportunityId,  // v4.3.43: For stable file naming
                header: headerData,
                lineItems: lineItems,
                groupedItems: groupedItems,
                categoryTotals: categoryTotals,
                systemInfo: systemInfo,
                roomsList: roomsList,  // v3.8.0 - New parsed rooms array
                roomsHtml: roomsHtml,  // Legacy HTML fallback
                performanceHtml: performanceHtml,
                estimatorNotes: estimatorNotes,
                salesRep: salesRep,
                heatPumpPerformance: heatPumpPerformance,  // v4.1.7 - Heat pump performance fields
                importantNotes: { titles: noteTitlesArray, descriptions: noteDescriptionsArray },  // v4.2.0 - Important Notes arrays
                hasImportantNotes: hasImportantNotes,  // v4.2.0 - Important Notes flag
                hasRooms: hasRoomsData,
                hasPerformance: (performanceHtml && performanceHtml.trim().length > 0) || hasHeatPumpPerformanceData,
                hasHeatPumpPerformance: hasHeatPumpPerformanceData,
                hasEstimatorNotes: estimatorNotes && estimatorNotes.trim().length > 0,
                hasHeatPump:                 groupedItems['Heat Pump'].length > 0,
                hasSolar:                    groupedItems['Solar thermal'].length > 0,
                hasDesignPackageStandard:    hasDesignPackageItem(lineItems, DESIGN_PACKAGE_ITEMS.STANDARD_UFH),
                hasDesignPackageUpgrade:     hasDesignPackageItem(lineItems, DESIGN_PACKAGE_ITEMS.UPGRADE_UFH),
                hasDesignPackage:            hasDesignPackageItem(lineItems, DESIGN_PACKAGE_ITEMS.STANDARD_UFH) ||
                                             hasDesignPackageItem(lineItems, DESIGN_PACKAGE_ITEMS.UPGRADE_UFH)
            };

            log.audit('loadQuoteData', 'Design package detection — standard: ' + quoteData.hasDesignPackageStandard + ', upgrade: ' + quoteData.hasDesignPackageUpgrade);

            // Log complete section visibility summary
            debugLog('SectionVisibility', 'Section display summary', {
                Header: 'ALWAYS SHOW',
                TrustBadges: 'ALWAYS SHOW',
                TopTotal: 'ALWAYS SHOW',
                QuickLinks: (groupedItems['Underfloor heating'].length + groupedItems['Heat Pump'].length + 
                            groupedItems['Solar thermal'].length + groupedItems['Commissioning'].length) > 0 ? 'SHOW' : 'HIDE',
                UFHProducts: groupedItems['Underfloor heating'].length > 0 ? 'SHOW (' + groupedItems['Underfloor heating'].length + ' items)' : 'HIDE (0 items)',
                HeatPumpProducts: groupedItems['Heat Pump'].length > 0 ? 'SHOW (' + groupedItems['Heat Pump'].length + ' items)' : 'HIDE (0 items)',
                SolarProducts: groupedItems['Solar thermal'].length > 0 ? 'SHOW (' + groupedItems['Solar thermal'].length + ' items)' : 'HIDE (0 items)',
                Commissioning: groupedItems['Commissioning'].length > 0 ? 'SHOW (' + groupedItems['Commissioning'].length + ' items)' : 'HIDE (0 items)',
                OtherItems: groupedItems['Other'].length > 0 ? 'SHOW (' + groupedItems['Other'].length + ' items)' : 'HIDE (0 items)',
                TotalSection: 'ALWAYS SHOW',
                ProjectSpecifications: (quoteData.hasRooms || quoteData.hasPerformance || quoteData.hasEstimatorNotes || quoteData.hasImportantNotes) ? 'SHOW' : 'HIDE',
                RoomsTable: quoteData.hasRooms ? 'SHOW' : 'HIDE',
                PerformanceEstimates: quoteData.hasPerformance ? 'SHOW' : 'HIDE',
                ImportantInfo: (quoteData.hasImportantNotes || quoteData.hasEstimatorNotes) ? 'SHOW' : 'HIDE',
                DesignImportance: 'ALWAYS SHOW',
                Upgrades: 'ALWAYS SHOW',
                NextSteps: 'ALWAYS SHOW',
                CTABanner: 'ALWAYS SHOW',
                Footer: 'ALWAYS SHOW'
            });
            
            return quoteData;
        }

        function extractHeaderData(estimate, debugLog, freshPricingFields) {
            debugLog = debugLog || function() {};
            freshPricingFields = freshPricingFields || {};
            const customerId = estimate.getValue({ fieldId: 'entity' });
            const customerName = estimate.getText({ fieldId: 'entity' }) || '';
            const tranId = estimate.getValue({ fieldId: 'tranid' }) || '';
            const tranDate = estimate.getValue({ fieldId: 'trandate' });
            const formattedDate = tranDate ? formatDate(tranDate) : '';
            
            // v4.3.50: STALE DATA FIX - prefer client script overrides over record.load()
            // record.load() values may be cached in the same execution context
            var subtotalFromRecord = parseFloat(estimate.getValue({ fieldId: 'subtotal' })) || 0;
            var taxTotalFromRecord = parseFloat(estimate.getValue({ fieldId: 'taxtotal' })) || 0;
            var totalFromRecord = parseFloat(estimate.getValue({ fieldId: 'total' })) || 0;
            var discountFromRecord = parseFloat(estimate.getValue({ fieldId: 'discounttotal' })) || 0;
            
            // Use fresh DB values if available, otherwise fall back to record.load values
            var subtotal = freshPricingFields.subtotal !== undefined ? parseFloat(freshPricingFields.subtotal) || 0 : subtotalFromRecord;
            var taxTotal = freshPricingFields.taxtotal !== undefined ? parseFloat(freshPricingFields.taxtotal) || 0 : taxTotalFromRecord;
            var total = freshPricingFields.total !== undefined ? parseFloat(freshPricingFields.total) || 0 : totalFromRecord;
            var discountTotal = freshPricingFields.discounttotal !== undefined ? parseFloat(freshPricingFields.discounttotal) || 0 : discountFromRecord;
            
            log.audit('extractHeaderData', 'v4.3.50 Pricing source comparison: ' +
                'subtotal(override=' + freshPricingFields.subtotal + ',rec=' + subtotalFromRecord + ',used=' + subtotal + ') ' +
                'total(override=' + freshPricingFields.total + ',rec=' + totalFromRecord + ',used=' + total + ') ' +
                'discount(override=' + freshPricingFields.discounttotal + ',rec=' + discountFromRecord + ',used=' + discountTotal + ')');
            debugLog('extractHeaderData', 'v4.3.50 Pricing resolution', {
                subtotal: { override: freshPricingFields.subtotal, record: subtotalFromRecord, used: subtotal },
                total: { override: freshPricingFields.total, record: totalFromRecord, used: total },
                discount: { override: freshPricingFields.discounttotal, record: discountFromRecord, used: discountTotal },
                source: freshPricingFields.discounttotal !== undefined ? 'client script overrides (TIER 1)' : 'record.load (TIER 2)'
            });
            
            
            // Updated field mappings per Quote content and logic.xlsx
            const projectAddress = estimate.getValue({ fieldId: 'custbody_opp_site_adress' }) || 
                                  estimate.getValue({ fieldId: 'custbody_project_address' }) || '';
            const projectName = estimate.getValue({ fieldId: 'custbody_project_name' }) || '';
            const projectId = estimate.getValue({ fieldId: 'custbody_project_id' }) || '';
            const quoteVersion = estimate.getValue({ fieldId: 'custbody_quote_version' }) || '1';
            
            // Sales rep contact info from estimate/opportunity fields
            const salesRepPhone = estimate.getValue({ fieldId: 'custbody_sales_rep_phone' }) || '';
            const salesRepEmail = estimate.getValue({ fieldId: 'custbody_sales_rep_email' }) || '';
            
            let expiryDate = estimate.getValue({ fieldId: 'duedate' });
            if (!expiryDate && tranDate) {
                const expDate = new Date(tranDate);
                expDate.setDate(expDate.getDate() + 30);
                expiryDate = expDate;
            }

            const currency = estimate.getText({ fieldId: 'currency' }) || 'GBP';
            const currencySymbol = getCurrencySymbol(currency);

            // Try to get customer firstname using record.load() for reliability
            let customerFirstName = '';
            if (customerId) {
                try {
                    // Load customer record directly to get firstname field
                    const customerRecord = record.load({
                        type: record.Type.CUSTOMER,
                        id: customerId,
                        isDynamic: false
                    });
                    customerFirstName = customerRecord.getValue({ fieldId: 'firstname' }) || '';
                    
                    // Trim whitespace
                    if (customerFirstName) {
                        customerFirstName = customerFirstName.trim();
                    }
                    
                    debugLog('CustomerFirstName', 'Loaded from customer record', { 
                        customerId: customerId, 
                        firstname: customerFirstName 
                    });
                } catch (e) {
                    // Fallback: try search.lookupFields
                    try {
                        const custFields = search.lookupFields({
                            type: search.Type.CUSTOMER,
                            id: customerId,
                            columns: ['firstname']
                        });
                        customerFirstName = custFields.firstname || '';
                        if (customerFirstName) {
                            customerFirstName = customerFirstName.trim();
                        }
                    } catch (e2) {
                        // Leave empty - do NOT use entity name as fallback
                        debugLog('CustomerFirstName', 'Could not retrieve firstname', { error: e2.message });
                    }
                }
            }

            return {
                customerId: customerId,
                customerName: customerName,
                customerFirstName: customerFirstName,
                tranId: tranId,
                tranDate: formattedDate,
                rawTranDate: tranDate,
                expiryDate: expiryDate ? formatDate(expiryDate) : '',
                subtotal: subtotal,
                taxTotal: taxTotal,
                total: total,
                discountTotal: Math.abs(discountTotal),
                hasDiscount: discountTotal !== 0,
                projectName: projectName,
                projectAddress: projectAddress,
                projectId: projectId,
                quoteVersion: quoteVersion,
                currency: currency,
                currencySymbol: currencySymbol,
                salesRepPhone: salesRepPhone,
                salesRepEmail: salesRepEmail
            };
        }

        function extractLineItems(estimate, debugLog) {
            debugLog = debugLog || function() {};
            const items = [];
            const lineCount = estimate.getLineCount({ sublistId: 'item' });
            
            debugLog('LineItems', '=== EXTRACTING LINE ITEMS (v3.4.0 DIAGNOSTIC) ===', { lineCount: lineCount });
            log.debug('EXTRACT_LINE_ITEMS', '=== Starting extraction of ' + lineCount + ' lines (v3.4.0) ===');

            for (let i = 0; i < lineCount; i++) {
                // Get item value (should be internal ID - numeric)
                const rawItemValue = estimate.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
                // Get item text (should be item name/SKU - text like "UMFP0112-C")
                const rawItemText = estimate.getSublistText({ sublistId: 'item', fieldId: 'item', line: i });
                
                // =====================================================================
                // NEW v3.4.0: Get item type from estimate line
                // =====================================================================
                const lineItemType = estimate.getSublistValue({ sublistId: 'item', fieldId: 'itemtype', line: i }) || '';
                const lineItemTypeText = estimate.getSublistText({ sublistId: 'item', fieldId: 'itemtype', line: i }) || '';
                
                // Log exactly what we're getting including item type
                log.debug('EXTRACT_LINE_' + i, 
                    'Line ' + i + ': getValue(item)=' + JSON.stringify(rawItemValue) + 
                    ' | getText(item)=' + JSON.stringify(rawItemText) +
                    ' | itemtype=' + lineItemType + '/' + lineItemTypeText);
                
                // Determine if itemValue looks numeric (internal ID) or like a SKU
                const itemValueIsNumeric = rawItemValue && !isNaN(parseInt(rawItemValue, 10));
                const itemValueLooksLikeSKU = rawItemValue && /^[A-Za-z]/.test(String(rawItemValue));
                
                log.debug('EXTRACT_LINE_' + i + '_ANALYSIS',
                    'itemValueIsNumeric=' + itemValueIsNumeric + 
                    ', itemValueLooksLikeSKU=' + itemValueLooksLikeSKU +
                    ', itemType=' + lineItemType +
                    ', parsed int=' + parseInt(rawItemValue, 10));
                
                const item = {
                    line: i + 1,
                    // Store both values for diagnosis
                    itemId: rawItemValue,              // This SHOULD be internal ID (numeric)
                    itemName: rawItemText || '',       // This SHOULD be display name/SKU
                    itemIdRaw: rawItemValue,           // Keep original for debug
                    itemIdType: typeof rawItemValue,   // Track type for debug
                    itemIdIsNumeric: itemValueIsNumeric,
                    itemIdLooksLikeSKU: itemValueLooksLikeSKU,
                    // NEW v3.4.0: Item type from estimate line
                    estimateLineItemType: lineItemType,
                    estimateLineItemTypeText: lineItemTypeText,
                    description: estimate.getSublistValue({ sublistId: 'item', fieldId: 'description', line: i }) || '',
                    quantity: parseFloat(estimate.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i })) || 0,
                    rate: parseFloat(estimate.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: i })) || 0,
                    amount: parseFloat(estimate.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: i })) || 0,
                    productType: '',
                    productTypeRaw: '',
                    productTypeText: '',
                    productTypeResolutionMethod: '',
                    // v4.3.34: productCategory removed (used productTypeText for category filtering instead)
                    quoteDescription: '',
                    productImage: '',
                    features: [],
                    dataSheetUrl: '',
                    itemType: lineItemType,   // Store item type detected from line
                    loadMethod: '',
                    // NEW v3.4.0: Diagnostic fields
                    diagnostics: {
                        hasField_custitem_prod_type: null,
                        fieldAccessMethods: {},
                        allFieldsOnRecord: [],
                        loadErrors: []
                    }
                };
                
                debugLog('LineItem', 'Line ' + (i + 1) + ' extracted', {
                    itemId: item.itemId,
                    itemIdType: item.itemIdType,
                    itemIdIsNumeric: item.itemIdIsNumeric,
                    itemName: item.itemName,
                    estimateItemType: lineItemType,
                    amount: item.amount
                });
                
                items.push(item);
            }
            
            // Summary log
            const numericIds = items.filter(function(i) { return i.itemIdIsNumeric; }).length;
            const skuLikeIds = items.filter(function(i) { return i.itemIdLooksLikeSKU; }).length;
            
            log.debug('EXTRACT_SUMMARY', 
                'Total items: ' + items.length + 
                ', Numeric IDs: ' + numericIds + 
                ', SKU-like IDs: ' + skuLikeIds);
            
            debugLog('LineItems', 'Extraction complete', {
                total: items.length,
                numericIds: numericIds,
                skuLikeIds: skuLikeIds,
                sampleItemId: items.length > 0 ? items[0].itemId : 'N/A',
                sampleItemName: items.length > 0 ? items[0].itemName : 'N/A'
            });

            if (items.length > 0) {
                loadItemCustomFields(items, debugLog);
            }

            return items;
        }

        /**
         * Get NetSuite record type from item type string
         * 
         * @param {string} itemType - Item type from estimate line (e.g., 'InvtPart', 'Assembly')
         * @returns {string} - NetSuite record type constant
         */
        function getRecordTypeFromItemType(itemType) {
            var typeMap = {
                'InvtPart': record.Type.INVENTORY_ITEM,
                'Assembly': record.Type.ASSEMBLY_ITEM,
                'NonInvtPart': record.Type.NON_INVENTORY_ITEM,
                'Service': record.Type.SERVICE_ITEM,
                'Kit': record.Type.KIT_ITEM,
                'Group': record.Type.ITEM_GROUP,
                'Description': record.Type.DESCRIPTION_ITEM,
                'Discount': record.Type.DISCOUNT_ITEM,
                'Payment': record.Type.PAYMENT_ITEM,
                'Subtotal': record.Type.SUBTOTAL_ITEM,
                'OthCharge': record.Type.OTHER_CHARGE_ITEM,
                'GiftCert': record.Type.GIFT_CERTIFICATE_ITEM,
                'Download': record.Type.DOWNLOAD_ITEM,
                'Markup': record.Type.MARKUP_ITEM
            };
            
            return typeMap[itemType] || record.Type.INVENTORY_ITEM;
        }

        /**
         * Load custom fields from ITEM records using record.load()
         * 
         * VERSION 3.5.0: Now uses record.load() EXCLUSIVELY (not search)
         * 
         * IMPORTANT: custitem_prod_type is a custom field on the ITEM record, not on the estimate line!
         * You CANNOT read it from estimate.getSublistValue() - it will always be empty.
         * 
         * Loading Strategy (v3.5.0):
         * 1. For each item, load the item record directly using record.load()
         * 2. Read custitem_prod_type using getValue() and getText()
         * 3. Resolve IDs to display names using PRODUCT_TYPE_ID_MAP
         * 
         * This approach is more reliable than search for retrieving custom field values.
         * 
         * @param {Array} items - Array of line items with itemId and estimateLineItemType properties
         * @param {Function} debugLog - Debug logging function
         */
        function loadItemCustomFields(items, debugLog) {
            debugLog = debugLog || function() {};
            
            if (items.length === 0) {
                debugLog('ItemFields', 'No items to load', {});
                return;
            }
            
            log.debug('ITEM_FIELDS_START', 
                '=== loadItemCustomFields v3.5.0 (RECORD_LOAD PRIMARY) ===' +
                '\nTotal items: ' + items.length);
            
            debugLog('ItemFields', '=== LOADING ITEM CUSTOM FIELDS (v3.5.0 - RECORD_LOAD) ===', { 
                itemCount: items.length,
                method: 'record.load() for each item'
            });

            var successCount = 0;
            var errorCount = 0;
            var emptyProdTypeCount = 0;
            
            // =====================================================================
            // LOAD EACH ITEM DIRECTLY USING record.load()
            // =====================================================================
            items.forEach(function(item, index) {
                var itemId = item.itemId;
                var itemType = item.estimateLineItemType || 'InvtPart';
                var itemName = item.itemName || 'Unknown';
                
                // Skip if no valid ID
                if (!itemId || isNaN(parseInt(itemId, 10))) {
                    log.debug('SKIP_ITEM', 
                        'Skipping item ' + (index + 1) + ': invalid itemId "' + itemId + '"');
                    item.loadMethod = 'SKIPPED';
                    errorCount++;
                    return;
                }
                
                // Progress logging
                log.debug('LOAD_PROGRESS', 
                    'Loading item ' + (index + 1) + ' of ' + items.length + 
                    ': ID=' + itemId + ', Type=' + itemType + ', Name=' + itemName);
                
                debugLog('ItemLoad', 'Loading item ' + (index + 1) + '/' + items.length, {
                    itemId: itemId,
                    itemType: itemType,
                    itemName: itemName
                });
                
                try {
                    // Determine record type from item type
                    var recordType = getRecordTypeFromItemType(itemType);
                    
                    log.debug('RECORD_TYPE', 
                        'Item ' + itemId + ': itemType=' + itemType + ' -> recordType=' + recordType);
                    
                    // Load the item record
                    var itemRecord = record.load({
                        type: recordType,
                        id: itemId,
                        isDynamic: false
                    });
                    
                    // Get custitem_prod_type - try multiple methods for reliability
                    var prodTypeId = '';
                    var prodTypeText = '';
                    
                    try {
                        prodTypeId = itemRecord.getValue({ fieldId: 'custitem_prod_type' }) || '';
                    } catch (e1) {
                        log.debug('GET_VALUE_ERROR', 'Item ' + itemId + ': getValue failed: ' + e1.message);
                    }
                    
                    try {
                        prodTypeText = itemRecord.getText({ fieldId: 'custitem_prod_type' }) || '';
                    } catch (e2) {
                        log.debug('GET_TEXT_ERROR', 'Item ' + itemId + ': getText failed: ' + e2.message);
                    }
                    
                    // v4.3.33: Previously tried to load custitem_product_category (doesn't exist)
                    // v4.3.34: Removed - category filtering now uses prodTypeText (getText of custitem_prod_type)
                    // The display text of custitem_prod_type (e.g., "Pump", "Plumbing") is already loaded above
                    
                    // Get other custom fields
                    var quoteDescription = '';
                    var quoteProductName = '';
                    var productImageRef = '';
                    var productImageUrl = '';
                    var features = [];
                    
                    try {
                        quoteDescription = itemRecord.getValue({ fieldId: 'custitem_quote_description' }) || '';
                    } catch (e) {}
                    
                    // v4.3.6: Get custom product name for display on product cards
                    try {
                        quoteProductName = itemRecord.getValue({ fieldId: 'custitem_quote_product_name' }) || '';
                    } catch (e) {}
                    
                    // =====================================================================
                    // ENHANCED IMAGE FIELD DEBUG LOGGING (v3.6.6)
                    // =====================================================================
                    try {
                        debugLog('IMAGE_PROCESS_START', 'Starting image processing for ' + itemName, { itemId: itemId });
                        log.debug('IMAGE_PROCESS_START', 'Item ' + itemId + ' (' + itemName + '): Starting image processing');
                        
                        // Get raw value
                        var imageFieldRaw = itemRecord.getValue({ fieldId: 'custitem_quote_prod_visual_1' });
                        productImageRef = imageFieldRaw || '';
                        
                        // Debug logging: raw value details
                        log.debug('IMAGE_FIELD_RAW', 
                            'Item ' + itemId + ' raw value: ' + JSON.stringify(imageFieldRaw));
                        
                        debugLog('ImageField', 'Raw value details for ' + itemName, {
                            raw: JSON.stringify(imageFieldRaw),
                            type: typeof imageFieldRaw,
                            length: imageFieldRaw ? String(imageFieldRaw).length : 0
                        });
                        
                        // Try getText as alternative
                        var imageFieldText = '';
                        try {
                            imageFieldText = itemRecord.getText({ fieldId: 'custitem_quote_prod_visual_1' }) || '';
                            log.debug('IMAGE_FIELD_TEXT', 'Item ' + itemId + ' getText: ' + imageFieldText);
                            debugLog('ImageField', 'getText result for ' + itemName, { text: imageFieldText });
                        } catch (textErr) {
                            log.debug('IMAGE_TEXT_ERROR', 'Item ' + itemId + ' getText failed: ' + textErr.message);
                            debugLog('ImageField', 'getText failed for ' + itemName, { error: textErr.message });
                        }
                        
                        // Approach 1: Check if it's already a URL
                        if (productImageRef && typeof productImageRef === 'string' && 
                            (productImageRef.indexOf('http') === 0 || productImageRef.indexOf('/') === 0)) {
                            productImageUrl = productImageRef;
                            log.debug('IMAGE_URL_DIRECT', 'Item ' + itemId + ': Using direct URL: ' + productImageUrl);
                            debugLog('ImageDirect', 'Direct URL for ' + itemName, { url: productImageUrl });
                        }
                        // Approach 2: Try file.load() with the reference (file ID)
                        else if (productImageRef) {
                            log.debug('IMAGE_CALLING_GETFILEURL', 'Item ' + itemId + ': Calling getFileUrl with ref=' + productImageRef);
                            debugLog('ImageFileLoad', 'Calling getFileUrl for ' + itemName, { ref: productImageRef });
                            
                            try {
                                productImageUrl = getFileUrl(productImageRef, debugLog);
                                log.debug('IMAGE_GETFILEURL_RESULT', 'Item ' + itemId + ': getFileUrl returned: ' + (productImageUrl || 'EMPTY'));
                                debugLog('ImageFileResult', 'getFileUrl result for ' + itemName, { 
                                    inputRef: productImageRef, 
                                    resultUrl: productImageUrl || 'EMPTY' 
                                });
                            } catch (fileLoadErr) {
                                log.error('IMAGE_GETFILEURL_ERROR', 'Item ' + itemId + ': getFileUrl threw error: ' + fileLoadErr.message);
                                debugLog('ImageFileError', 'getFileUrl error for ' + itemName, { 
                                    error: fileLoadErr.message,
                                    stack: fileLoadErr.stack 
                                });
                            }
                        }
                        // Approach 3: Try getText value if getValue didn't work
                        else if (imageFieldText && !productImageUrl) {
                            debugLog('ImageTextFallback', 'Trying getText value for ' + itemName, { text: imageFieldText });
                            
                            if (imageFieldText.indexOf('http') === 0 || imageFieldText.indexOf('/') === 0) {
                                productImageUrl = imageFieldText;
                                log.debug('IMAGE_TEXT_URL', 'Item ' + itemId + ': Using text as URL: ' + productImageUrl);
                                debugLog('ImageTextUrl', 'Using getText as URL for ' + itemName, { url: productImageUrl });
                            } else {
                                try {
                                    productImageUrl = getFileUrl(imageFieldText, debugLog);
                                    debugLog('ImageTextFileResult', 'getFileUrl from getText for ' + itemName, { 
                                        url: productImageUrl || 'EMPTY' 
                                    });
                                } catch (textFileErr) {
                                    debugLog('ImageTextFileError', 'getFileUrl from getText failed for ' + itemName, { 
                                        error: textFileErr.message 
                                    });
                                }
                            }
                        } else {
                            debugLog('ImageNoRef', 'No image reference found for ' + itemName, {});
                        }
                        
                        // Final status log
                        log.debug('IMAGE_FINAL', 'Item ' + itemId + ': Final imageUrl=' + (productImageUrl || 'NONE'));
                        debugLog('IMAGE_PROCESS_END', 'Image processing complete for ' + itemName, { 
                            finalUrl: productImageUrl || 'NONE',
                            hasImage: !!productImageUrl
                        });
                        
                    } catch (e) {
                        log.error('PRODUCT_IMAGE_ERROR', 'Item ' + itemId + ': Failed to load product image: ' + e.message + ', Stack: ' + e.stack);
                        debugLog('ImageError', 'Image load EXCEPTION for ' + itemName, { 
                            error: e.message, 
                            stack: e.stack 
                        });
                    }
                    
                    // Get features (fab_1 through fab_6)
                    for (var f = 1; f <= 6; f++) {
                        try {
                            var fab = itemRecord.getValue({ fieldId: 'custitem_quote_fab_' + f });
                            if (fab) features.push(fab);
                        } catch (e) {}
                    }
                    
                    // v4.3.40: Get product info link URL
                    var productInfoLink = '';
                    try {
                        productInfoLink = itemRecord.getValue({ fieldId: 'custitem_prod_info_link' }) || '';
                    } catch (e) {
                        debugLog('ProductInfoLink', 'Failed to read custitem_prod_info_link for ' + itemName, { error: e.message });
                    }
                    
                    // Resolve product type ID to display name
                    var resolvedProductType = prodTypeText;
                    var resolutionMethod = prodTypeText ? 'getText()' : '';
                    
                    if (!resolvedProductType && prodTypeId) {
                        var idStr = String(prodTypeId);
                        if (PRODUCT_TYPE_ID_MAP[idStr]) {
                            resolvedProductType = PRODUCT_TYPE_ID_MAP[idStr];
                            resolutionMethod = 'HARDCODED_MAP[' + idStr + ']';
                        } else {
                            resolvedProductType = prodTypeId;
                            resolutionMethod = 'RAW_ID';
                        }
                    }
                    
                    if (!resolvedProductType) {
                        resolutionMethod = 'NOT_SET';
                        emptyProdTypeCount++;
                    }
                    
                    // Update item with loaded data
                    item.productType = resolvedProductType;
                    item.productTypeRaw = prodTypeId ? String(prodTypeId) : '';
                    item.productTypeText = prodTypeText;
                    item.productTypeResolutionMethod = resolutionMethod;
                    // v4.3.34: productCategory removed (custitem_product_category doesn't exist)
                    // Category filtering now uses productTypeText (getText of custitem_prod_type)
                    item.quoteDescription = quoteDescription;
                    item.quoteProductName = quoteProductName;  // v4.3.6: Custom display name for product cards
                    item.dataSheetUrl = productInfoLink;  // v4.3.40: Product info link from custitem_prod_info_link
                    item.productImage = productImageUrl;  // Store the resolved URL, not the raw reference
                    item.productImageRef = productImageRef;  // Keep original reference for debugging
                    item.features = features;
                    item.loadMethod = 'RECORD_LOAD';
                    item.loadSuccess = true;
                    
                    // Update description if quote description is available
                    if (quoteDescription) {
                        item.description = quoteDescription;
                    }
                    
                    successCount++;
                    
                    log.debug('LOAD_SUCCESS', 
                        'Item ' + itemId + ' (' + itemName + '):' +
                        ' prodTypeId="' + prodTypeId + '"' +
                        ', prodTypeText="' + prodTypeText + '"' +
                        ', resolved="' + resolvedProductType + '"' +
                        ', method=' + resolutionMethod);
                    
                    debugLog('ItemLoaded', itemName, {
                        itemId: itemId,
                        prodTypeId: prodTypeId || 'EMPTY',
                        prodTypeText: prodTypeText || 'EMPTY',
                        resolved: resolvedProductType || 'EMPTY',
                        method: resolutionMethod,
                        featuresCount: features.length,
                        imageRef: productImageRef || 'EMPTY',
                        imageUrl: productImageUrl ? 'RESOLVED' : 'EMPTY'
                    });
                    
                } catch (loadError) {
                    errorCount++;
                    
                    log.error('LOAD_ERROR', 
                        'Failed to load item ' + itemId + ' (' + itemName + '):' +
                        '\n  Error: ' + loadError.message +
                        '\n  Type used: ' + getRecordTypeFromItemType(itemType) +
                        '\n  Stack: ' + (loadError.stack || 'N/A'));
                    
                    item.loadMethod = 'ERROR';
                    item.loadError = loadError.message;
                    item.loadSuccess = false;
                    
                    debugLog('ItemLoadError', 'FAILED: ' + itemName, {
                        itemId: itemId,
                        itemType: itemType,
                        error: loadError.message
                    });
                }
            });
            
            // =====================================================================
            // SUMMARY LOGGING
            // =====================================================================
            var summaryMsg = 'SUCCESS: ' + successCount + '/' + items.length + ' items loaded';
            if (errorCount > 0) {
                summaryMsg = 'PARTIAL: ' + successCount + ' loaded, ' + errorCount + ' errors';
            }
            if (emptyProdTypeCount > 0) {
                summaryMsg += ', ' + emptyProdTypeCount + ' without custitem_prod_type';
            }
            
            log.audit('ITEM_FIELDS_COMPLETE', 
                '=== loadItemCustomFields COMPLETE ===' +
                '\n  Total: ' + items.length +
                '\n  Success: ' + successCount +
                '\n  Errors: ' + errorCount +
                '\n  Empty prod_type: ' + emptyProdTypeCount);
            
            debugLog('ItemFields', '=== ITEM LOADING COMPLETE (v3.5.0) ===', {
                totalItems: items.length,
                success: successCount,
                errors: errorCount,
                emptyProdType: emptyProdTypeCount,
                summary: summaryMsg
            });
        }

        function groupItemsByCategory(lineItems, debugLog) {
            debugLog = debugLog || function() {};
            
            const groups = {
                'Underfloor heating': [],
                'Heat Pump': [],
                'Solar thermal': [],
                'Commissioning': [],
                'Other': []
            };
            
            debugLog('Categorization', '=== STARTING ITEM CATEGORIZATION (v3.3.0 ID-BASED) ===', { 
                itemCount: lineItems.length,
                categoryMappings: {
                    UFH_IDs: PRODUCT_CATEGORY_MAP.UFH,
                    HP_IDs: PRODUCT_CATEGORY_MAP.HEAT_PUMP,
                    Solar_IDs: PRODUCT_CATEGORY_MAP.SOLAR,
                    Commissioning_IDs: PRODUCT_CATEGORY_MAP.COMMISSIONING
                }
            });

            lineItems.forEach(function(item, index) {
                // =====================================================================
                // STEP 1: Try ID-based categorization first (most reliable)
                // =====================================================================
                var productTypeId = getProductTypeId(item);
                var resolvedName = PRODUCT_TYPE_ID_MAP[String(productTypeId)] || '';
                var matched = false;
                var matchedCategory = '';
                var matchMethod = '';
                
                log.debug('CATEGORIZE_ITEM', 
                    'Item #' + (index + 1) + ': ' + item.itemName + 
                    ' | productTypeRaw="' + (item.productTypeRaw || '') + '"' +
                    ' | productType="' + (item.productType || '') + '"' +
                    ' | parsedId=' + productTypeId +
                    ' | resolvedName="' + resolvedName + '"'
                );
                
                // Check ID against category maps
                if (productTypeId > 0) {
                    if (PRODUCT_CATEGORY_MAP.UFH.indexOf(productTypeId) !== -1) {
                        matched = true;
                        matchedCategory = 'Underfloor heating';
                        matchMethod = 'ID:' + productTypeId + ' -> UFH';
                        groups['Underfloor heating'].push(item);
                    } else if (PRODUCT_CATEGORY_MAP.HEAT_PUMP.indexOf(productTypeId) !== -1) {
                        matched = true;
                        matchedCategory = 'Heat Pump';
                        matchMethod = 'ID:' + productTypeId + ' -> HP';
                        groups['Heat Pump'].push(item);
                    } else if (PRODUCT_CATEGORY_MAP.SOLAR.indexOf(productTypeId) !== -1) {
                        matched = true;
                        matchedCategory = 'Solar thermal';
                        matchMethod = 'ID:' + productTypeId + ' -> Solar';
                        groups['Solar thermal'].push(item);
                    } else if (PRODUCT_CATEGORY_MAP.COMMISSIONING.indexOf(productTypeId) !== -1) {
                        matched = true;
                        matchedCategory = 'Commissioning';
                        matchMethod = 'ID:' + productTypeId + ' -> Commissioning';
                        groups['Commissioning'].push(item);
                    }
                }
                
                // =====================================================================
                // STEP 2: Fallback to text-based matching ONLY if item has NO valid product type ID
                // v4.3.31: Items with a valid ID (> 0) that aren't in PRODUCT_CATEGORY_MAP
                // go straight to 'Other' - they should only appear in Component Breakdown
                // =====================================================================
                if (!matched && productTypeId > 0) {
                    // Item has a known product type ID but it's not in any category map
                    // Do NOT try text-based fallback - send to 'Other' (Component Breakdown only)
                    log.debug('CATEGORIZE_ID_NOT_MAPPED', 
                        'Item #' + (index + 1) + ': ' + item.itemName + 
                        ' | productTypeId=' + productTypeId + 
                        ' | Not in any PRODUCT_CATEGORY_MAP - skipping text fallback, assigning to Other'
                    );
                    matched = false;  // Will be caught by Step 3
                }
                if (!matched && productTypeId === 0) {
                    // Build combined text value for matching
                    var rawProdType = item.productType || '';
                    var rawProdTypeText = item.productTypeText || '';  // v4.3.34: use productTypeText instead of productCategory
                    var prodTypeText = resolvedName || rawProdType || '';
                    var combinedText = [prodTypeText, rawProdTypeText].filter(function(v) { return v; }).join(' ').toLowerCase().trim();
                    
                    log.debug('CATEGORIZE_TEXT_FALLBACK', 
                        'Item #' + (index + 1) + ': trying text match with "' + combinedText + '"'
                    );
                    
                    // Check UFH keywords
                    PRODUCT_TYPES.UFH.some(function(keyword) {
                        if (combinedText.includes(keyword)) {
                            matched = true;
                            matchedCategory = 'Underfloor heating';
                            matchMethod = 'TEXT:"' + keyword + '" -> UFH';
                            groups['Underfloor heating'].push(item);
                            return true;
                        }
                        return false;
                    });
                    
                    // Check HP keywords
                    if (!matched) {
                        PRODUCT_TYPES.HP.some(function(keyword) {
                            if (combinedText.includes(keyword)) {
                                matched = true;
                                matchedCategory = 'Heat Pump';
                                matchMethod = 'TEXT:"' + keyword + '" -> HP';
                                groups['Heat Pump'].push(item);
                                return true;
                            }
                            return false;
                        });
                    }
                    
                    // Check Solar keywords
                    if (!matched) {
                        PRODUCT_TYPES.SOLAR.some(function(keyword) {
                            if (combinedText.includes(keyword)) {
                                matched = true;
                                matchedCategory = 'Solar thermal';
                                matchMethod = 'TEXT:"' + keyword + '" -> Solar';
                                groups['Solar thermal'].push(item);
                                return true;
                            }
                            return false;
                        });
                    }
                    
                    // Check Commissioning keywords
                    if (!matched) {
                        PRODUCT_TYPES.COMMISSIONING.some(function(keyword) {
                            if (combinedText.includes(keyword)) {
                                matched = true;
                                matchedCategory = 'Commissioning';
                                matchMethod = 'TEXT:"' + keyword + '" -> Commissioning';
                                groups['Commissioning'].push(item);
                                return true;
                            }
                            return false;
                        });
                    }
                }
                
                // =====================================================================
                // STEP 3: If still no match, categorize as "Other"
                // =====================================================================
                if (!matched) {
                    groups['Other'].push(item);
                    matchedCategory = 'Other';
                    matchMethod = 'NO_MATCH';
                }
                
                // Store categorization info on item for debug panel
                item._categoryInfo = {
                    productTypeId: productTypeId,
                    resolvedName: resolvedName,
                    assignedCategory: matchedCategory,
                    matchMethod: matchMethod
                };
                
                // Log result
                log.debug('CATEGORIZE_RESULT', 
                    'Item #' + (index + 1) + ': ' + item.itemName + 
                    ' | ID=' + productTypeId + 
                    ' | Name="' + resolvedName + '"' +
                    ' | Category=' + matchedCategory + 
                    ' | Method=' + matchMethod
                );
                
                debugLog('Categorization', 'Item ' + (index + 1) + ': ' + item.itemName, {
                    productTypeId: productTypeId,
                    resolvedProductTypeName: resolvedName,
                    rawProductTypeValue: item.productTypeRaw || '',
                    assignedCategory: matchedCategory,
                    matchMethod: matchMethod
                });
            });

            // Log summary of categorization
            log.audit('Category Summary (v3.3.0)', 
                'UFH: ' + groups['Underfloor heating'].length + 
                ', HP: ' + groups['Heat Pump'].length + 
                ', Solar: ' + groups['Solar thermal'].length + 
                ', Comm: ' + groups['Commissioning'].length + 
                ', Other: ' + groups['Other'].length);
            
            debugLog('Categorization', 'Categorization complete (v3.3.0 ID-based)', {
                UFH_count: groups['Underfloor heating'].length,
                HP_count: groups['Heat Pump'].length,
                Solar_count: groups['Solar thermal'].length,
                Commissioning_count: groups['Commissioning'].length,
                Other_count: groups['Other'].length,
                UFH_items: groups['Underfloor heating'].map(function(i) { 
                    return i.itemName + ' (ID:' + (i._categoryInfo ? i._categoryInfo.productTypeId : '?') + ')'; 
                }),
                Other_items: groups['Other'].map(function(i) { 
                    return i.itemName + ' (ID:' + (i._categoryInfo ? i._categoryInfo.productTypeId : '?') + ', type:' + (i.productType || 'unknown') + ')'; 
                })
            });

            return groups;
        }

        function calculateCategoryTotals(groupedItems, currencySymbol, estimate) {
            const totals = {};
            
            // Try to get category-specific totals from custom fields
            const ufhPrice = parseFloat(estimate.getValue({ fieldId: 'custbody_quote_ufh_price' })) || 0;
            const hpPrice = parseFloat(estimate.getValue({ fieldId: 'custbody_quote_hp_price' })) || 0;
            const solarPrice = parseFloat(estimate.getValue({ fieldId: 'custbodyquote_st_price' })) || 0;
            
            for (const category in groupedItems) {
                const items = groupedItems[category];
                let total;
                
                // Use custom field totals if available, else calculate from items
                if (category === 'Underfloor heating' && ufhPrice > 0) {
                    total = ufhPrice;
                } else if (category === 'Heat Pump' && hpPrice > 0) {
                    total = hpPrice;
                } else if (category === 'Solar thermal' && solarPrice > 0) {
                    total = solarPrice;
                } else {
                    total = items.reduce(function(sum, item) { return sum + item.amount; }, 0);
                }
                
                totals[category] = {
                    count: items.length,
                    total: total,
                    formatted: currencySymbol + formatNumber(total)
                };
            }
            
            return totals;
        }

        function detectMultiSystem(lineItems, debugLog) {
            debugLog = debugLog || function() {};
            
            // =====================================================================
            // Filter items that belong to UFH category using ID-based approach (v3.3.0)
            // =====================================================================
            const floorConstructionItems = lineItems.filter(function(item) {
                // v4.3.31: Strict ID-based matching only for items with valid IDs
                var productTypeId = getProductTypeId(item);
                if (productTypeId > 0) {
                    return PRODUCT_CATEGORY_MAP.UFH.indexOf(productTypeId) !== -1;
                }
                
                // Fallback to text-based matching ONLY for items without a valid product type ID
                var prodType = (item.productType || item.productTypeText || '').toLowerCase().trim();  // v4.3.34: use productTypeText
                return PRODUCT_TYPES.UFH.some(function(t) { return prodType.includes(t); });
            });

            const uniqueSystems = {};
            floorConstructionItems.forEach(function(item) {
                if (!uniqueSystems[item.itemId]) {
                    uniqueSystems[item.itemId] = {
                        id: item.itemId,
                        name: item.itemName,
                        description: item.description,
                        productTypeId: parseInt(item.productTypeRaw || '0', 10)
                    };
                }
            });

            const systemList = Object.values(uniqueSystems);
            const systemCount = systemList.length;

            const result = {
                count: systemCount,
                systems: systemList,
                isMultiSystem: systemCount >= 2,
                isSingleSystem: systemCount === 1,
                hasNoSystem: systemCount === 0,
                tagText: systemCount === 0 ? '' : 
                         systemCount === 1 ? systemList[0].name :
                         'Multi-System (' + systemCount + ' systems)'
            };
            
            debugLog('MultiSystem', 'System detection result (v3.3.0 ID-based)', {
                floorConstructionItemsCount: floorConstructionItems.length,
                uniqueSystemCount: systemCount,
                isMultiSystem: result.isMultiSystem,
                systemNames: systemList.map(function(s) { return s.name + ' (ID:' + s.productTypeId + ')'; })
            });
            
            return result;
        }

        function loadSalesRepData(estimate, debugLog) {
            debugLog = debugLog || function() {};
            
            const salesRepId = estimate.getValue({ fieldId: 'salesrep' });
            
            // Get phone/email from estimate fields first (per Quote content and logic.xlsx)
            const salesRepPhone = estimate.getValue({ fieldId: 'custbody_sales_rep_phone' }) || '';
            const salesRepEmail = estimate.getValue({ fieldId: 'custbody_sales_rep_email' }) || '';
            
            debugLog('SalesRep', 'Loading sales rep data', {
                salesRepId: salesRepId,
                custbody_sales_rep_phone: salesRepPhone,
                custbody_sales_rep_email: salesRepEmail
            });
            
            const defaultRep = {
                name: 'Nu-Heat Team',
                firstName: 'Nu-Heat',
                email: salesRepEmail || BRAND.contact.email,
                phone: salesRepPhone || BRAND.contact.phone,
                hasPhoto: false,
                photoUrl: ''
            };

            if (!salesRepId) {
                debugLog('SalesRep', 'No sales rep ID, using defaults', defaultRep);
                return defaultRep;
            }

            try {
                const empSearch = search.create({
                    type: search.Type.EMPLOYEE,
                    filters: [['internalid', 'is', salesRepId]],
                    columns: ['entityid', 'firstname', 'lastname', 'email', 'phone', 'image']
                });

                let repData = defaultRep;
                empSearch.run().each(function(result) {
                    const firstName = result.getValue({ name: 'firstname' }) || '';
                    const lastName = result.getValue({ name: 'lastname' }) || '';
                    const empEmail = result.getValue({ name: 'email' }) || '';
                    const empPhone = result.getValue({ name: 'phone' }) || '';
                    const imageId = result.getValue({ name: 'image' }) || '';

                    repData = {
                        name: (firstName + ' ' + lastName).trim() || result.getValue({ name: 'entityid' }),
                        firstName: firstName,
                        // Use estimate fields first, then employee fields, then defaults
                        email: salesRepEmail || empEmail || BRAND.contact.email,
                        phone: salesRepPhone || empPhone || BRAND.contact.phone,
                        hasPhoto: !!imageId,
                        photoUrl: imageId ? getFileUrl(imageId) : ''
                    };
                    
                    debugLog('SalesRep', 'Employee data loaded', {
                        empFirstName: firstName,
                        empLastName: lastName,
                        empEmail: empEmail,
                        empPhone: empPhone,
                        hasImage: !!imageId
                    });
                    
                    return false;
                });

                return repData;

            } catch (e) {
                log.error('Error loading sales rep', e.message);
                debugLog('SalesRepError', 'Exception loading sales rep', { error: e.message });
                return defaultRep;
            }
        }

        // =====================================================================
        // HTML RENDERING FUNCTIONS
        // =====================================================================
        // v3.7.0 - Restructured with collapsible sections
        function renderQuotePage(quoteData) {
            const css = generateCSS();
            const header = renderHeader(quoteData);
            const trustBadges = renderTrustBadges();
            const topTotalSection = renderTopTotalSection(quoteData);
            const spacer = '<div class="top-section-spacer"></div>';
            
            // Recommended Solutions (collapsible section)
            const recommendationsHeader = renderRecommendationsHeader();
            const quickLinks = renderQuickLinks(quoteData);
            const productSections = renderProductSections(quoteData);
            const recommendationsFooter = renderRecommendationsFooter();
            
            // Project Specification (collapsible section - includes design importance)
            const projectSpecSection = renderProjectSpecSection(quoteData);
            
            // Upgrades & Offers (new collapsible section)
            const upgradesSection = renderUpgradesSection(quoteData);
            
            const nextStepsSection = renderNextStepsSection(quoteData);
            const ctaBanner = renderCtaBanner(quoteData);
            const footer = renderFooter(quoteData);

            return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'    <meta name="robots" content="noindex, nofollow">\n' +
'    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n' +
'    <meta http-equiv="Pragma" content="no-cache">\n' +
'    <meta http-equiv="Expires" content="0">\n' +
'    <title>Your Quote - ' + escapeHtml(quoteData.header.tranId) + ' | Nu-Heat</title>\n' +
'    <link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
'    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n' +
'    <style>' + css + '</style>\n' +
'</head>\n' +
'<body>\n' +
'    <div class="page-container">\n' +
        header +
        trustBadges +
        topTotalSection +
        spacer +
        // Collapsible: Recommended Solutions and Costs
        recommendationsHeader +
'        <main class="main-content">\n' +
            quickLinks +
            productSections +
'        </main>\n' +
        recommendationsFooter +
        // Collapsible: Project Specification
        projectSpecSection +
        // Collapsible: Upgrades & Offers
        upgradesSection +
        nextStepsSection +
        ctaBanner +
        footer +
'    </div>\n' +
'    <script>' + generateJS() + '</script>\n' +
'</body>\n' +
'</html>';
        }

        function generateCSS() {
            return '\n' +
':root {\n' +
'    --color-primary: ' + BRAND.colors.primary + ';\n' +
'    --color-primary-dark: ' + BRAND.colors.primaryDark + ';\n' +
'    --color-secondary: ' + BRAND.colors.secondary + ';\n' +
'    --color-accent: ' + BRAND.colors.accent + ';\n' +
'    --color-yellow: ' + BRAND.colors.yellow + ';\n' +
'    --color-purple: ' + BRAND.colors.purple + ';\n' +
'    --color-magenta: ' + BRAND.colors.magenta + ';\n' +
'    --color-text: ' + BRAND.colors.textPrimary + ';\n' +
'    --color-text-light: ' + BRAND.colors.textSecondary + ';\n' +
'    --color-gray-light: ' + BRAND.colors.lightGray + ';\n' +
'    --color-white: ' + BRAND.colors.white + ';\n' +
'    --color-bg: ' + BRAND.colors.background + ';\n' +
'    --color-success: ' + BRAND.colors.success + ';\n' +
'    --font-family: "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\n' +
'    --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);\n' +
'    --shadow-md: 0 4px 12px rgba(0,0,0,0.1);\n' +
'    --shadow-lg: 0 8px 24px rgba(0,0,0,0.12);\n' +
'    --radius-sm: 4px;\n' +
'    --radius-md: 8px;\n' +
'    --radius-lg: 12px;\n' +
'    --radius-xl: 16px;\n' +
'    --max-width: 1000px;\n' +
'}\n' +
'* { margin: 0; padding: 0; box-sizing: border-box; }\n' +
'body { font-family: var(--font-family); font-size: 16px; line-height: 1.6; color: var(--color-text); background-color: var(--color-bg); -webkit-font-smoothing: antialiased; }\n' +
'.page-container { max-width: var(--max-width); margin: 0 auto; background: var(--color-white); box-shadow: var(--shadow-lg); }\n' +

// Header styles - v3.5.1 Two-section design
// Top bar (teal)
'.header-top-bar { background: var(--color-primary); color: var(--color-white); padding: 15px 40px; }\n' +
'.header-top-bar-inner { display: flex; justify-content: space-between; align-items: center; }\n' +
'.logo-area { display: flex; flex-direction: column; }\n' +
'.logo-area .nuheat-logo { height: 40px; width: auto; }\n' +
'.footer-logo { margin-bottom: 16px; }\n' +
'.footer-logo .nuheat-logo { height: 44px; width: auto; }\n' +
'.header-actions { display: flex; gap: 24px; align-items: center; }\n' +
'.header-contact { display: flex; gap: 12px; font-size: 14px; }\n' +
'.header-contact a { color: var(--color-white); text-decoration: none; opacity: 0.95; display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; font-size: 13px; font-weight: 500; transition: all 0.2s ease; }\n' +
'.header-contact a:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.5); text-decoration: none; opacity: 1; }\n' +
'.btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; border-radius: 8px; font-family: var(--font-family); font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; border: none; transition: all 0.2s ease; }\n' +
'.btn-primary { background: #AA0061; color: var(--color-white); }\n' +
'.btn-primary:hover { background: #8a0050; transform: translateY(-1px); }\n' +
'.btn-secondary { background: rgba(255,255,255,0.15); color: var(--color-white); border: 1px solid rgba(255,255,255,0.3); }\n' +
'.btn-secondary:hover { background: rgba(255,255,255,0.25); }\n' +
'.btn-download-pdf { background: transparent; color: var(--color-white); border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; padding: 8px 16px; font-size: 13px; font-weight: 500; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s ease; font-family: var(--font-family); }\n' +
'.btn-download-pdf:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.5); }\n' +

// Header content (white background) - v3.7.9: reduced padding
'.header-content { background: var(--color-white); padding: 30px 40px; }\n' +
'.greeting-row { display: flex; align-items: flex-start; gap: 60px; margin-bottom: 25px; max-width: 100%; }\n' +
'.greeting-text { flex: 0 0 auto; max-width: 100%; overflow: hidden; }\n' +
'.greeting-h1 { font-size: 48px; font-weight: 700; color: #333333; margin: 0; line-height: 1.1; word-wrap: break-word; overflow-wrap: break-word; }\n' +
'.greeting-h2 { font-size: 32px; font-weight: 400; color: #333333; margin: 10px 0 0 0; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; word-wrap: break-word; overflow-wrap: break-word; }\n' +
'.system-tag { display: inline-block; padding: 6px 16px; background: var(--color-magenta); color: var(--color-white); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 20px; }\n' +
'.greeting-photo { flex: 0 0 auto; }\n' +
'.greeting-photo .manager-photo, .greeting-photo .manager-photo-placeholder { width: 100px; height: 100px; border-radius: 50%; border: 4px solid var(--color-primary); }\n' +
'.greeting-photo .manager-photo-placeholder { background: var(--color-secondary); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 600; color: var(--color-white); }\n' +

// Customer info grid (white background) - v4.0.4: Reduced spacing, left-aligned, bold keys
'.customer-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }\n' +
'.info-block { }\n' +
'.info-block h3 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--color-primary); margin-bottom: 12px; text-align: left; }\n' +
'.info-item { display: flex; justify-content: flex-start; align-items: flex-start; margin-bottom: 4px; padding: 2px 0; font-size: 15px; color: #333333; line-height: 1.4; }\n' +
'.info-label { font-weight: 700; color: #333333; text-align: left; margin-right: 8px; flex-shrink: 0; }\n' +
'.info-value { font-weight: 400; text-align: left; color: #333333; }\n' +

// Account manager (white background version) - v4.0.6: Fixed CSS targeting with !important
// v4.0.7: Removed margin-left/padding-left to fix vertical alignment with header
'.account-manager { display: flex; align-items: flex-start; gap: 16px; padding: 0; background: transparent; margin-left: 0; padding-left: 0; text-align: left !important; }\n' +
'.account-manager .manager-info { flex: 1; text-align: left !important; }\n' +
'.account-manager .manager-info-label { font-size: 13px; color: #666666; margin-bottom: 4px; text-align: left !important; }\n' +
'.account-manager .manager-detail { font-size: 14px; color: #333333; line-height: 1.6; margin: 4px 0; text-align: left !important; }\n' +
'.account-manager .manager-detail .manager-label { font-weight: 700 !important; color: #333333; margin-right: 4px; }\n' +
'.account-manager .manager-detail a { color: #333333; text-decoration: none; }\n' +
'.account-manager .manager-detail a:hover { color: var(--color-primary); text-decoration: underline; }\n' +
// Force bold on all possible label elements in account manager section
'.manager-label { font-weight: 700 !important; }\n' +
'span.manager-label { font-weight: 700 !important; color: #333333; }\n' +
// Legacy support - manager-name now same style as manager-detail
'.account-manager .manager-name { font-size: 14px; font-weight: 400; color: #333333; margin-bottom: 0; }\n' +
'.account-manager .manager-contact { font-size: 14px; color: #333333; line-height: 1.6; }\n' +
'.account-manager .manager-contact a { color: #333333; text-decoration: none; }\n' +
'.account-manager .manager-contact a:hover { color: var(--color-primary); text-decoration: underline; }\n' +
'.account-manager .manager-contact strong { font-weight: 700 !important; color: #333333; }\n' +

// Legacy support for old manager photo classes
'.manager-photo { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 3px solid var(--color-primary); }\n' +
'.manager-photo-placeholder { width: 60px; height: 60px; border-radius: 50%; background: var(--color-secondary); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 600; color: var(--color-white); border: 3px solid var(--color-primary); }\n' +

// Trust badges (v3.5.2 - Updated with larger icons and text) - v3.7.9: reduced padding
'.trust-badges { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 20px 40px; background: var(--color-white); border-bottom: 1px solid var(--color-gray-light); }\n' +
'.trust-badge { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 8px; }\n' +
'.badge-icon-img { width: 64px; height: 64px; margin-bottom: 10px; object-fit: contain; }\n' +
'.badge-icon { width: 64px; height: 64px; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; background: var(--color-primary); border-radius: 50%; color: var(--color-white); }\n' +
'.badge-icon svg { width: 32px; height: 32px; }\n' +
'.badge-icon.trustpilot { background: var(--color-success); }\n' +
'.badge-title { font-size: 14px; font-weight: 500; color: var(--color-text); line-height: 1.3; }\n' +
'.badge-subtitle { font-size: 14px; font-weight: 500; color: var(--color-text); margin-top: 2px; line-height: 1.3; }\n' +

// Top total section - v4.1.5: Horizontal layout for desktop, centered/stacked on mobile
'.top-total-section { background: #00857D; color: var(--color-white); padding: 25px 40px; margin: 0; }\n' +
'.top-total-header { display: flex; flex-direction: row; justify-content: space-between; align-items: baseline; }\n' +
'.top-total-left { text-align: left; }\n' +
'.top-total-title { font-size: 32px; font-weight: 700; margin: 0; }\n' +
'.top-total-terms { font-size: 14px; opacity: 0.9; margin: 10px 0 0 0; }\n' +
'.top-total-right { text-align: right; }\n' +
'.top-total-amount { font-size: 36px; font-weight: 700; margin-bottom: 10px; }\n' +
'.top-total-plus-vat { font-size: 20px; font-weight: 400; vertical-align: middle; }\n' +
'.top-total-vat { font-size: 18px; font-weight: 400; }\n' +
'.top-total-breakdown { font-size: 14px; opacity: 0.9; margin-top: 15px; }\n' +
'.top-total-breakdown-item { margin-bottom: 5px; }\n' +
'.top-total-inc-vat { font-size: 16px; font-weight: 700; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.3); }\n' +

// Quick links
'.quick-links { display: flex; align-items: center; gap: 8px; padding: 16px 0; margin-bottom: 24px; border-bottom: 1px solid var(--color-gray-light); font-size: 14px; flex-wrap: wrap; }\n' +
'.quick-links-label { font-weight: 500; color: var(--color-text-light); }\n' +
'.quick-links a { color: var(--color-primary); text-decoration: none; padding: 4px 12px; border-radius: var(--radius-sm); transition: all 0.2s ease; }\n' +
'.quick-links a:hover { background: var(--color-primary); color: var(--color-white); }\n' +
'.quick-links-divider { color: var(--color-gray-light); }\n' +

// Spacer after top total - v3.7.9: reduced
'.top-section-spacer { height: 25px; background: var(--color-white); }\n' +

// Recommendations header section (v3.6.0)
// v3.7.0 - Collapsible Major Sections - v3.7.9: reduced padding - v4.0.8: 75% taller headers
// v4.1.6: Standardized all section header heights to 44px padding
'.collapsible-section { margin-bottom: 0; border-radius: 0; overflow: hidden; }\n' +
'.collapsible-header { padding: 44px 40px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s; }\n' +
'.collapsible-header:hover { opacity: 0.95; }\n' +
'.collapsible-header h2 { font-size: 32px; font-weight: 700; margin: 0; line-height: 1.2; }\n' +
'.collapsible-toggle { font-size: 20px; transition: transform 0.3s ease; }\n' +
'.collapsible-toggle.collapsed { transform: rotate(-90deg); }\n' +
'.collapsible-content { transition: max-height 0.3s ease-out; overflow: hidden; }\n' +
'.collapsible-content.collapsed { display: none; }\n' +

// Recommended Solutions header (collapsible) - v4.0.8: Updated to gray #53565a - v4.1.6: Standardized height
'.recommendations-header { background: #53565a; color: var(--color-white); padding: 44px 40px !important; }\n' +
'.recommendations-header h2 { font-size: 32px !important; font-weight: 700; margin: 0; color: white; line-height: 1.2; }\n' +
'.recommendations-header .collapsible-toggle { color: white; }\n' +
'.recommendations-header:hover { background: #45484b; }\n' +

// Project Specification header (collapsible) - v3.7.6: Updated to darker brown/grey - v4.1.6: Standardized height
'.project-spec-header { background: #7e8083; color: var(--color-white); margin-top: 25px; padding: 44px 40px !important; }\n' +
'.project-spec-header h2 { font-size: 32px !important; font-weight: 700; margin: 0; color: white; line-height: 1.2; }\n' +
'.project-spec-header .collapsible-toggle { color: white; }\n' +
'.project-spec-header:hover { background: #6e7073; }\n' +

// v4.3.20: Standardized teal section headers - consistent size and weight across all H2 headers
'.ufh-tree-title, .hp-tree-title, .category-title, .project-spec-group-header, .thermostat-options-header { font-size: 28px !important; font-weight: 600 !important; color: var(--color-primary) !important; margin-bottom: 12px !important; }\n' +
'.project-spec-group-header:first-of-type { margin-top: 0 !important; }\n' +

// Upgrades & Offers header (collapsible) - v4.1.3: Updated to light gray (#a9abac) - v4.1.6: Standardized height
'.upgrades-header { background: #a9abac !important; color: var(--color-white); margin-top: 25px; padding: 44px 40px !important; }\n' +
'.upgrades-header h2 { font-size: 32px !important; font-weight: 700; margin: 0; color: white; line-height: 1.2; }\n' +
'.upgrades-header .collapsible-toggle { color: white; }\n' +
'.upgrades-header:hover { background: #9a9c9d; }\n' +

// UFH Tree structure (v3.6.1 - removed indentation) - v3.7.9: reduced margins
'.ufh-tree-section { margin-bottom: 30px; }\n' +
'.ufh-tree-title { font-size: 28px; font-weight: 600; color: var(--color-primary); margin-bottom: 12px; }\n' +
'.ufh-tree-intro { color: #666; margin-bottom: 20px; font-size: 15px; line-height: 1.6; max-width: 800px; }\n' +
'.tree-level-1 { margin-left: 0; margin-top: 18px; }\n' +
// v3.6.3: Removed .tree-level-1 h3 color override - product-name class handles styling
'.tree-subsection { margin-left: 0; margin-top: 18px; }\n' +
// v3.6.3: Removed .tree-subsection h4 color override - product-name class handles styling

// v3.8.5: Removed UFH subsection CSS (ufh-subsection-title, product-item classes)
// UFH section now uses standard product-card classes for consistency with Heat Pump section


// UFH Price card (v3.6.1) - v4.0.9: Right-aligned price values matching commissioning format
'.ufh-price-card { margin-top: 20px; padding: 15px 20px; background: #f5f5f5; border-left: 4px solid var(--color-primary); display: flex; flex-direction: column; gap: 4px; }\n' +
'.ufh-price-row { display: flex; justify-content: space-between; align-items: baseline; }\n' +
'.ufh-price-label { font-size: 18px; font-weight: 400; color: #666; }\n' +
'.ufh-price-amount { font-size: 28px; font-weight: 700; color: #333; text-align: right; }\n' +
'.ufh-price-vat { font-size: 16px; font-weight: 400; color: #666; display: inline; margin-left: 4px; }\n' +

// Heat Pump Tree structure (v3.7.6) - v4.0.9: Right-aligned price values
'.hp-tree-section { margin-bottom: 30px; }\n' +
'.hp-tree-title { font-size: 28px; font-weight: 600; color: var(--color-primary); margin-bottom: 12px; }\n' +
'.hp-tree-intro { color: #666; margin-bottom: 20px; font-size: 15px; line-height: 1.6; max-width: 800px; }\n' +
'.hp-subsection { margin-bottom: 18px; }\n' +
'.hp-subsection-title { color: var(--color-primary); font-size: 16px; font-weight: bold; text-transform: uppercase; margin-bottom: 12px; margin-top: 15px; }\n' +
'.hp-price-card { margin-top: 20px; padding: 15px 20px; background: #f5f5f5; border-left: 4px solid var(--color-primary); display: flex; flex-direction: column; gap: 4px; }\n' +
'.hp-price-row { display: flex; justify-content: space-between; align-items: baseline; }\n' +
'.hp-price-label { font-size: 18px; font-weight: 400; color: #666; }\n' +
'.hp-price-amount { font-size: 28px; font-weight: 700; color: #333; text-align: right; }\n' +
'.hp-price-vat { font-size: 16px; font-weight: 400; color: #666; display: inline; margin-left: 4px; }\n' +
'.hp-grant-banner { margin-top: 15px; padding: 15px; background: linear-gradient(135deg, #f0f9f8 0%, #e8f7f6 100%); border-radius: var(--radius-md); border-left: 4px solid var(--color-primary); display: flex; align-items: flex-start; gap: 12px; }\n' +
'.hp-grant-banner-icon { color: var(--color-primary); flex-shrink: 0; }\n' +
'.hp-grant-banner-text strong { display: block; color: var(--color-primary); margin-bottom: 4px; }\n' +
'.hp-grant-banner-text span { color: #666; font-size: 14px; }\n' +

// Component Breakdown (v3.6.1 - collapsible with all items) - v3.7.9: reduced margins
'.component-breakdown { margin-top: 20px; }\n' +
'.component-breakdown-header { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 12px; background: #f5f5f5; border-radius: var(--radius-sm); }\n' +
'.component-breakdown-header:hover { background: #ebebeb; }\n' +
'.component-breakdown-header h3 { color: var(--color-text); margin: 0; font-size: 15px; font-weight: 600; }\n' +
// v4.0.9: Removed CSS rotation - arrow direction is handled by JavaScript (▶ collapsed, ▼ expanded)
'.component-breakdown-toggle { background: var(--color-primary); color: var(--color-white); border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; flex-shrink: 0; }\n' +
'.component-breakdown-content { display: none; padding: 0; margin-top: 0; }\n' +
'.component-breakdown-content.open { display: block; }\n' +
'.component-breakdown-table { width: 100%; border-collapse: collapse; font-size: 13px; }\n' +
'.component-breakdown-table th { padding: 10px 10px; text-align: left; background: #f5f5f5; border-bottom: 2px solid #ddd; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-light); }\n' +
'.component-breakdown-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; }\n' +
'.component-breakdown-table tbody tr:hover { background: #f9f9f9; }\n' +
'.component-breakdown-table .qty-col { width: 60px; }\n' +
'.component-breakdown-table .name-col { width: 180px; }\n' +

// Upgrade Options cards (v3.7.1 - UFH-style category sections with standard product cards) - v3.7.9: reduced spacing
'.upgrade-options { margin-left: 0; margin-top: 15px; }\n' +
'.upgrade-category { margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid #eee; }\n' +
'.upgrade-category:last-child { border-bottom: none; }\n' +
'.upgrade-category h3 { color: var(--color-primary); font-size: 20px; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; }\n' +
'.upgrade-category > p { color: var(--color-text-light); margin-bottom: 15px; line-height: 1.6; font-size: 15px; }\n' +
// v3.7.1: Upgrade cards now use standard .product-card styling from UFH section
'.upgrade-subsection { margin-left: 0; margin-bottom: 20px; }\n' +
'.upgrade-subsection h4 { color: var(--color-primary); font-size: 18px; font-weight: 600; margin-bottom: 12px; text-transform: uppercase; }\n' +
'.upgrade-subsection > p { color: var(--color-text-light); margin-bottom: 15px; line-height: 1.6; }\n' +

// v3.8.6: Thermostat upgrade tiles - 3-column layout
'.thermostat-tiles-container { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; border-top: 1px solid #D3D3D3; border-bottom: 1px solid #D3D3D3; padding: 20px 0; }\n' +
'.thermostat-tile { display: flex; flex-direction: column; padding: 20px; background: white; min-height: 220px; }\n' +
'.thermostat-tile-title { font-size: 18px; font-weight: bold; color: #000; margin-bottom: 15px; text-align: left; }\n' +
'.thermostat-tile-benefits { list-style: none; padding: 0; margin: 0 0 20px 0; flex: 1; text-align: left; }\n' +
'.thermostat-tile-benefits li { color: #53565A; font-size: 14px; line-height: 1.6; margin-bottom: 10px; padding-left: 25px; position: relative; text-align: left; }\n' +
'.thermostat-tile-benefits li:before { content: "✓"; position: absolute; left: 0; color: var(--color-primary); font-weight: bold; font-size: 16px; }\n' +
'.thermostat-tile-link { color: var(--color-primary); text-decoration: none; font-size: 14px; font-weight: bold; display: inline-block; padding: 8px 0; text-align: left; border-bottom: 2px solid transparent; transition: border-bottom-color 0.3s; }\n' +
'.thermostat-tile-link:hover { border-bottom-color: var(--color-primary); }\n' +

// v4.3.9: Mini product cards for thermostat options - compact cards with images
// v4.3.14: Dynamic layout for 3 or 4 cards using auto-fit grid
'.mini-product-cards-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin: 20px 0; padding: 20px 0; border-top: 1px solid #D3D3D3; border-bottom: 1px solid #D3D3D3; }\n' +
// Specific layouts for 3 and 4 cards to ensure even distribution
'.mini-product-cards-container.cards-3 { grid-template-columns: repeat(3, 1fr); }\n' +
'.mini-product-cards-container.cards-4 { grid-template-columns: repeat(4, 1fr); }\n' +
// For wider screens with 4 cards, allow 2x2 layout option
'@media (min-width: 769px) and (max-width: 1100px) { .mini-product-cards-container.cards-4 { grid-template-columns: repeat(2, 1fr); } }\n' +
// v4.3.26: Added height: 100% for equal height cards in grid
'.mini-product-card { position: relative; display: flex; flex-direction: column; height: 100%; padding: 16px; background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }\n' +
'.mini-product-card.recommended { border: 2px solid var(--color-primary); }\n' +
'.mini-card-recommended-badge { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: var(--color-primary); color: #fff; font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }\n' +
'.mini-card-image { width: 100%; height: 120px; margin-bottom: 12px; border-radius: 6px; overflow: hidden; background: #f5f5f5; display: flex; align-items: center; justify-content: center; }\n' +
'.mini-card-image img { width: 100%; height: 100%; object-fit: cover; }\n' +
'.mini-card-image-placeholder { color: #ccc; }\n' +
'.mini-card-title { font-size: 16px; font-weight: 600; color: #333; margin-bottom: 8px; }\n' +
// v4.3.11: Removed line-clamp truncation to show full description
'.mini-card-description { font-size: 13px; color: #666; line-height: 1.5; margin-bottom: 12px; }\n' +
'.mini-card-benefits { list-style: none; padding: 0; margin: 0 0 12px 0; flex: 1; }\n' +
'.mini-card-benefits li { font-size: 13px; color: #53565A; line-height: 1.5; margin-bottom: 6px; padding-left: 20px; position: relative; }\n' +
'.mini-card-benefits li:before { content: "✓"; position: absolute; left: 0; color: var(--color-primary); font-weight: bold; font-size: 14px; }\n' +
// v4.3.26: Added margin-top: auto to push link to bottom of card
'.mini-card-link { color: var(--color-primary); text-decoration: none; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin-top: auto; }\n' +
'.mini-card-link:hover { text-decoration: underline; }\n' +
'.mini-card-link svg { width: 14px; height: 14px; }\n' +

// v3.9.0: Design Upgrade Card - two-column layout with image
'.upgrades-section-description { color: #53565A; line-height: 1.6; margin-bottom: 30px; font-size: 14px; }\n' +
'.design-upgrade-card { display: flex; gap: 40px; background: #F5F5F5; padding: 40px; margin: 0 0 30px 0; border-radius: 4px; }\n' +
'.design-upgrade-content { flex: 1; display: flex; flex-direction: column; }\n' +
'.design-upgrade-title { font-size: 28px; font-weight: bold; color: #000; margin-bottom: 20px; line-height: 1.3; }\n' +
'.design-upgrade-description { color: #53565A; font-size: 14px; line-height: 1.6; margin-bottom: 30px; }\n' +
'.design-upgrade-benefits { display: flex; gap: 40px; margin-bottom: 30px; }\n' +
'.design-upgrade-benefit { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }\n' +
'.design-upgrade-benefit .benefit-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; color: var(--color-primary); }\n' +
'.design-upgrade-benefit .benefit-icon svg { width: 40px; height: 40px; }\n' +
'.design-upgrade-benefit .benefit-text { color: var(--color-primary); font-size: 14px; font-weight: 500; }\n' +
// v3.9.1: Simple vertical benefits with tick marks
'.design-upgrade-benefits-vertical { flex-direction: column; gap: 12px; }\n' +
'.design-upgrade-benefit-simple { flex-direction: row; align-items: center; gap: 10px; }\n' +
'.design-upgrade-benefit-simple .benefit-tick { color: var(--color-primary); font-size: 20px; font-weight: bold; flex-shrink: 0; }\n' +
'.design-upgrade-benefit-simple .benefit-text-simple { color: #53565A; font-size: 14px; line-height: 1.5; }\n' +
'.design-upgrade-button { background: #999999; color: white; border: none; padding: 15px 35px; font-size: 16px; font-weight: 500; border-radius: 30px; cursor: pointer; align-self: flex-start; transition: all 0.3s; text-decoration: none; display: inline-block; }\n' +
'.design-upgrade-button:hover { background: #777777; }\n' +
'.design-upgrade-image { flex: 0 0 400px; width: 400px; }\n' +
'.design-upgrade-image img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; }\n' +

// Main content - v3.7.9: reduced padding
'.main-content { padding: 30px 40px; }\n' +
'.section { margin-bottom: 30px; }\n' +
'.section-title { font-size: 24px; font-weight: 600; color: var(--color-text); margin-bottom: 10px; }\n' +
'.section-intro { font-size: 15px; color: var(--color-text-light); margin-bottom: 18px; max-width: 800px; line-height: 1.7; }\n' +

// Category sections - v3.7.9: reduced margins - v4.0.8: H2 headers for consistency
'.category-section { margin-bottom: 30px; }\n' +
'.category-header { margin-bottom: 18px; }\n' +
'.category-title { font-size: 28px; font-weight: 600; color: var(--color-primary); margin-bottom: 12px; }\n' +
'.category-intro { font-size: 14px; color: var(--color-text-light); line-height: 1.6; max-width: 700px; }\n' +

// Product cards - v4.1.0: Fixed layout - images appear beside text (not below)
'.product-card { background: var(--color-white); border-top: 1px solid #D3D3D3; border-bottom: 1px solid #D3D3D3; border-left: none; border-right: none; border-radius: 0; box-shadow: none; padding: 20px 0; margin-bottom: 0; }\n' +
'.product-card + .product-card { border-top: none; }\n' +
'.product-card:hover { box-shadow: none; }\n' +
'.product-card-header { margin-bottom: 12px; }\n' +
'.product-name { font-size: 20px; font-weight: 600; color: var(--color-text); margin-bottom: 6px; }\n' +
// v4.3.5: Removed .product-quantity CSS class - quantity now inline in description text
'.product-description { font-size: 14px; color: var(--color-text-light); line-height: 1.6; margin: 0; }\n' +
// v4.1.1: Fixed grid layout - text constrained to left column, image on right
'.product-card-body { display: grid !important; grid-template-columns: 1fr 250px !important; gap: 20px !important; align-items: flex-start !important; }\n' +
'.product-features-column { display: flex !important; flex-direction: column !important; min-width: 0 !important; max-width: 100% !important; overflow: hidden !important; word-wrap: break-word !important; }\n' +
'.product-features-column .product-description { font-size: 14px; color: var(--color-text-light); line-height: 1.6; margin: 0 0 12px 0; }\n' +

// Product features grid (6 icons) - v3.6.4: Removed grey background - v3.7.9: reduced gap
'.product-features-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 14px; margin-bottom: 10px; flex: 1; }\n' +
'.product-feature { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-text); padding: 4px 0; }\n' +
'.product-feature-icon { width: 20px; height: 20px; color: var(--color-primary); flex-shrink: 0; display: flex; align-items: center; justify-content: center; }\n' +
'.product-feature-icon svg { width: 18px; height: 18px; stroke: var(--color-primary); stroke-width: 2.5; }\n' +

// Product image - v4.1.0: Fixed width column, image aligned to top
'.product-image-column { display: flex !important; flex-direction: column !important; align-items: flex-end !important; width: 250px !important; flex-shrink: 0 !important; }\n' +
'.product-image { width: 250px !important; height: auto !important; min-height: 150px; background: var(--color-bg); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; overflow: hidden; }\n' +
'.product-image img { width: 100%; height: auto; object-fit: contain; max-height: 200px; }\n' +
'.product-image-placeholder { color: var(--color-text-light); }\n' +
'.view-datasheet { display: inline-flex; align-items: center; gap: 6px; color: var(--color-primary); font-size: 13px; font-weight: 500; text-decoration: none; margin-top: 8px; }\n' +
'.view-datasheet:hover { text-decoration: underline; }\n' +

// Design Package benefit grid (2-column layout with tick + bullets)
'.design-benefit-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 20px; margin-bottom: 10px; }\n' +
'.design-benefit-cell { }\n' +
'.design-benefit-cell-header { display: flex; gap: 6px; align-items: flex-start; margin-bottom: 3px; }\n' +
'.design-benefit-cell-header .tick-svg { width: 18px; height: 18px; stroke: var(--color-primary); stroke-width: 2.5; fill: none; flex-shrink: 0; margin-top: 1px; }\n' +
'.design-benefit-cell-header span { font-size: 13px; font-weight: 500; color: #2c3e50; }\n' +
'.design-benefit-cell-bullets { padding-left: 24px; margin: 0; }\n' +
'.design-benefit-cell-bullets li { font-size: 12.5px; color: #7f8c8d; line-height: 1.4; padding: 1px 0; list-style-type: disc; }\n' +

// Upgrade banner (Standard UFH design card only)
'.upgrade-banner { margin-top: 14px; margin-bottom: 18px; background: #fff; border-radius: 8px; border: 1px solid #e0e0e0; padding: 18px 20px; overflow: hidden; position: relative; }\n' +
'.upgrade-banner-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }\n' +
'.upgrade-banner-tag { display: inline-block; background: #AA0061; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 12px; border-radius: 12px; }\n' +
'.upgrade-banner-content { flex: 1; }\n' +
'.upgrade-banner-title { font-size: 15px; font-weight: 600; color: #2c3e50; margin-bottom: 6px; line-height: 1.4; }\n' +
'.upgrade-banner-desc { font-size: 13px; color: #7f8c8d; line-height: 1.5; margin-bottom: 14px; }\n' +
'.upgrade-banner-cta { display: inline-flex; align-items: center; gap: 6px; background: #AA0061; color: white; font-size: 13px; font-weight: 600; padding: 10px 22px; border-radius: 6px; text-decoration: none; cursor: pointer; border: none; font-family: var(--font-family); transition: background 0.2s; }\n' +
'.upgrade-banner-cta:hover { background: #8a0050; }\n' +

// Category cost card (v4.0.9 - right-aligned values matching commissioning format)
'.category-cost-card { background: #f5f5f5; border-left: 4px solid var(--color-primary); padding: 15px 20px; margin-top: 18px; display: flex; flex-direction: column; gap: 4px; }\n' +
'.category-cost-row { display: flex; justify-content: space-between; align-items: baseline; }\n' +
'.category-cost-label { font-size: 18px; color: #666; font-weight: 400; }\n' +
'.category-cost-label small { display: block; font-size: 12px; color: #666; margin-top: 4px; }\n' +
'.category-cost-value { font-size: 28px; font-weight: 700; color: #333; text-align: right; }\n' +
'.category-cost-vat { font-size: 16px; font-weight: 400; color: #666; display: inline; margin-left: 4px; }\n' +

// Price breakdown
'.price-breakdown { margin-top: 16px; background: var(--color-bg); border-radius: var(--radius-md); overflow: hidden; }\n' +
'.price-breakdown-toggle { padding: 16px 20px; font-size: 14px; font-weight: 600; color: var(--color-text); cursor: pointer; display: flex; align-items: center; justify-content: space-between; }\n' +
'.price-breakdown-toggle:hover { background: rgba(0,0,0,0.03); }\n' +
'.price-breakdown-toggle .arrow { transition: transform 0.2s ease; }\n' +
'.price-breakdown-toggle.open .arrow { transform: rotate(180deg); }\n' +
'.price-breakdown-content { display: none; padding: 0 20px 20px; }\n' +
'.price-breakdown-content.open { display: block; }\n' +
'.price-breakdown-table { width: 100%; border-collapse: collapse; font-size: 13px; }\n' +
'.price-breakdown-table th, .price-breakdown-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--color-gray-light); }\n' +
'.price-breakdown-table th { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-light); background: var(--color-white); }\n' +
'.price-breakdown-table td.text-right, .price-breakdown-table th.text-right { text-align: right; }\n' +

// Grant banner (for Heat Pump)
'.grant-banner { background: var(--color-success); color: var(--color-white); padding: 16px 20px; border-radius: var(--radius-md); margin-top: 16px; display: flex; align-items: center; gap: 12px; }\n' +
'.grant-banner-icon { width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; }\n' +
'.grant-banner-text { flex: 1; }\n' +
'.grant-banner-text strong { font-size: 16px; display: block; margin-bottom: 2px; }\n' +
'.grant-banner-text span { font-size: 13px; opacity: 0.9; }\n' +

// Total section - v4.1.5: Horizontal layout for desktop, centered/stacked on mobile
'.total-section { background: #00857D; color: var(--color-white); padding: 25px 40px; border-radius: var(--radius-xl); margin: 30px 0; }\n' +
'.total-header { display: flex; flex-direction: row; justify-content: space-between; align-items: baseline; }\n' +
'.total-left { text-align: left; }\n' +
'.total-title { font-size: 32px; font-weight: 700; margin: 0; }\n' +
'.total-terms { font-size: 14px; opacity: 0.9; margin: 10px 0 0 0; }\n' +
'.total-right { text-align: right; }\n' +
'.total-amount { font-size: 36px; font-weight: 700; margin-bottom: 10px; }\n' +
'.total-breakdown-list { font-size: 14px; opacity: 0.9; margin-top: 15px; }\n' +
'.total-breakdown-item { margin-bottom: 5px; }\n' +
'.total-inc-vat { font-size: 16px; font-weight: 700; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.3); }\n' +

// Project specifications
'.project-spec-section { margin-top: 48px; }\n' +

// Heating by Room table (v3.8.0 - new delimited fields table)
'.heating-by-room-section { margin-bottom: 30px; }\n' +
'.rooms-table-container { overflow-x: auto; }\n' +
'.rooms-table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 8px; }\n' +
'.rooms-table th { padding: 12px 16px; text-align: left; font-weight: 600; color: #000; border-bottom: 2px solid var(--color-primary); background: transparent; font-size: 14px; }\n' +
'.rooms-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e0e0e0; color: var(--color-text); font-size: 14px; }\n' +
'.rooms-table tbody tr:hover { background: #f9f9f9; }\n' +
'.rooms-table td.room-name { color: #000; font-weight: 500; }\n' +

// Performance estimates
'.performance-section { margin-top: 40px; }\n' +
'.performance-card { background: var(--color-bg); border-radius: var(--radius-lg); padding: 24px; margin-top: 20px; }\n' +
'.performance-card h4 { font-size: 16px; font-weight: 600; color: var(--color-text); margin-bottom: 12px; }\n' +
'.performance-card p { font-size: 14px; color: var(--color-text-light); margin-bottom: 16px; line-height: 1.6; }\n' +
'.performance-table { width: 100%; border-collapse: collapse; font-size: 14px; }\n' +
'.performance-table td { padding: 10px 0; border-bottom: 1px solid var(--color-gray-light); }\n' +
'.performance-table td:first-child { color: var(--color-text-light); }\n' +
'.performance-table td:last-child { font-weight: 500; text-align: right; }\n' +

// v4.1.7: Heat pump performance layout - side by side
'.heat-pump-performance .performance-content-wrapper { display: flex; flex-direction: row; gap: 40px; align-items: flex-start; }\n' +
'.heat-pump-performance .performance-text { flex: 1; min-width: 0; }\n' +
'.heat-pump-performance .performance-text p { font-size: 14px; line-height: 1.6; color: var(--color-text-light); margin-bottom: 15px; }\n' +
'.heat-pump-performance .performance-data { flex: 0 0 380px; min-width: 300px; }\n' +
'.heat-pump-performance .performance-table { width: 100%; border-collapse: collapse; }\n' +
'.heat-pump-performance .performance-table tr { border-bottom: 1px solid var(--color-gray-light); }\n' +
'.heat-pump-performance .performance-table td { padding: 12px 8px; font-size: 14px; }\n' +
'.heat-pump-performance .perf-label { font-weight: 600; color: var(--color-text); text-align: left; }\n' +
'.heat-pump-performance .perf-value { font-weight: 400; color: var(--color-text-light); text-align: right; }\n' +

// Important information - v4.2.1: Reverted header styling to pre-v4.2.0 design, reduced text sizes to match heat pump performance
'.important-info-section { margin-top: 40px; }\n' +
'.important-info-toggle { background: var(--color-bg); padding: 16px 20px; border-radius: var(--radius-md); cursor: pointer; display: flex; justify-content: space-between; align-items: center; }\n' +
'.important-info-toggle h4 { font-size: 15px; font-weight: 600; color: var(--color-text); }\n' +
'.important-info-content { padding: 20px; background: var(--color-white); border: 1px solid var(--color-gray-light); border-top: none; border-radius: 0 0 var(--radius-md) var(--radius-md); display: none; }\n' +
'.important-info-content.open { display: block; }\n' +
// v4.3.21: Note item styling - dividers above each item (except first) for better visual separation
'.note-item { margin-bottom: 0; }\n' +
'.note-item:not(:first-child) { margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--color-gray-light); }\n' +
'.note-title { font-size: 14px; font-weight: 700; color: var(--color-text); margin: 0 0 10px 0; }\n' +
'.note-description { font-size: 14px; line-height: 1.6; color: var(--color-text-light); margin: 0; }\n' +

// Design importance section
'.design-importance { background: var(--color-bg); padding: 30px; border-radius: var(--radius-xl); margin: 30px 0; }\n' +
'.design-importance-content { display: flex; flex-direction: column; gap: 30px; }\n' +
'.design-importance h2 { font-size: 22px; font-weight: 600; color: var(--color-text); margin-bottom: 12px; }\n' +
'.design-importance p { font-size: 14px; color: var(--color-text-light); line-height: 1.7; margin-bottom: 12px; }\n' +
'.design-video { width: 100%; height: 220px; border-radius: var(--radius-lg); background: #000; overflow: hidden; }\n' +
'.design-video-play { width: 64px; height: 64px; background: rgba(255,255,255,0.9); border-radius: 50%; display: flex; align-items: center; justify-content: center; }\n' +
'.design-video-play svg { width: 24px; height: 24px; color: var(--color-primary); margin-left: 4px; }\n' +

// v3.9.1: Design importance inline with video layout
'.design-importance-with-video { display: flex; gap: 30px; align-items: flex-start; margin-top: 15px; }\n' +
'.design-importance-text-content { flex: 1; min-width: 0; }\n' +
'.design-importance-text-content p { color: var(--color-text-light); line-height: 1.7; font-size: 14px; }\n' +
'.design-importance-video { flex: 0 0 400px; width: 400px; }\n' +
'.design-importance-video iframe { width: 100%; height: 225px; border-radius: 8px; }\n' +

// v3.9.2: Design credentials section with icons
'.design-credentials { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 30px; padding-top: 25px; border-top: 1px solid #E0E0E0; }\n' +
'.credential-item { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 15px; }\n' +
'.credential-icon { position: relative; margin-bottom: 12px; }\n' +
'.credential-icon svg { width: 56px; height: 56px; }\n' +
'.credential-checkmark { position: absolute; bottom: -4px; right: -4px; width: 22px; height: 22px; background: var(--color-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; }\n' +
'.credential-checkmark svg { width: 12px; height: 12px; color: white; stroke: white; stroke-width: 3; }\n' +
'.credential-text { color: #000; font-size: 14px; font-weight: 600; line-height: 1.4; }\n' +
'.credential-divider { width: 1px; height: 80px; background: #D3D3D3; flex-shrink: 0; align-self: center; }\n' +

// Upgrades section
'.upgrades-section { margin-top: 48px; }\n' +
'.upgrades-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-top: 24px; }\n' +
'.upgrade-card { background: var(--color-white); border: 1px solid var(--color-gray-light); border-radius: var(--radius-lg); overflow: hidden; transition: transform 0.2s ease, box-shadow 0.2s ease; }\n' +
'.upgrade-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }\n' +
'.upgrade-card.featured { background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%); color: var(--color-white); border: none; }\n' +
'.upgrade-card.featured .upgrade-name, .upgrade-card.featured .upgrade-description { color: var(--color-white); }\n' +
'.upgrade-card.featured .upgrade-price { color: var(--color-white); }\n' +
'.upgrade-image { width: 100%; height: 140px; object-fit: cover; background: var(--color-gray-light); }\n' +
'.upgrade-content { padding: 20px; }\n' +
'.upgrade-name { font-size: 16px; font-weight: 600; margin-bottom: 8px; color: var(--color-text); }\n' +
'.upgrade-description { font-size: 13px; color: var(--color-text-light); margin-bottom: 12px; line-height: 1.5; }\n' +
'.upgrade-price { font-size: 18px; font-weight: 600; color: var(--color-primary); }\n' +

// Also need section
// v3.7.1: You May Also Need section - increased padding
'.also-need-section { margin-top: 30px; padding: 25px; background: #fafafa; border-radius: var(--radius-lg); }\n' +
'.also-need-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 18px; }\n' +
'.also-need-card { background: var(--color-white); border: 1px solid var(--color-gray-light); border-radius: var(--radius-md); padding: 20px; text-align: center; transition: box-shadow 0.2s ease; }\n' +
'.also-need-card:hover { box-shadow: var(--shadow-md); }\n' +
'.also-need-image { width: 80px; height: 80px; margin: 0 auto 12px; background: var(--color-bg); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; }\n' +
'.also-need-name { font-size: 14px; font-weight: 500; color: var(--color-text); margin-bottom: 10px; line-height: 1.5; }\n' +
'.also-need-price { font-size: 16px; font-weight: 600; color: var(--color-primary); }\n' +

'/* What Happens Next Section - v3.7.3 Simplified (no images) - v3.7.9: reduced padding */\n' +
'.what-happens-next-section { background: #f9f9f9; padding: 40px; margin: 30px 0; }\n' +
'.what-happens-next-section .section-title { font-size: 28px; font-weight: 600; color: var(--color-primary); margin-bottom: 12px; text-align: left; }\n' +
'.stages-container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 25px; max-width: 1400px; margin: 0 auto; }\n' +
'.stage-item { display: flex; flex-direction: column; align-items: flex-start; }\n' +
'.stage-number-row { display: flex; align-items: center; width: 100%; margin-bottom: 15px; position: relative; }\n' +
'.stage-number { width: 50px; height: 50px; background: var(--color-primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; flex-shrink: 0; z-index: 2; }\n' +
'.dotted-line { flex: 1; height: 2px; border-top: 2px dotted var(--color-primary); margin-left: 10px; }\n' +
'.stage-item:last-child .dotted-line { display: none; }\n' +
'.stage-title { font-size: 18px; font-weight: 700; color: #000; margin-bottom: 10px; text-align: left; }\n' +
'.stage-description { font-size: 14px; color: var(--color-text-light); line-height: 1.6; text-align: left; }\n' +
'.stage-item:hover { transform: translateY(-5px); transition: transform 0.3s ease; }\n' +
'/* Legacy support for old next-steps classes */\n' +
'.next-steps-section { background: var(--color-bg); padding: 48px 40px; }\n' +
'.next-steps-title { font-size: 22px; font-weight: 600; color: var(--color-text); text-align: center; margin-bottom: 32px; }\n' +
'.next-steps-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }\n' +
'.next-step { text-align: center; }\n' +
'.next-step-number { width: 48px; height: 48px; background: var(--color-primary); color: var(--color-white); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 600; margin: 0 auto 16px; }\n' +
'.next-step h4 { font-size: 15px; font-weight: 600; color: var(--color-text); margin-bottom: 8px; }\n' +
'.next-step p { font-size: 13px; color: var(--color-text-light); line-height: 1.5; }\n' +

// CTA Banner
'.cta-banner { background: #AA0061; color: var(--color-white); padding: 25px 40px; display: flex; justify-content: space-between; align-items: center; }\n' +
'.cta-text h3 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }\n' +
'.cta-text p { font-size: 14px; opacity: 0.9; }\n' +
'.cta-buttons { display: flex; gap: 12px; }\n' +
'.cta-button { background: var(--color-white); color: #AA0061; padding: 12px 24px; border-radius: 8px; font-weight: 600; text-decoration: none; transition: transform 0.2s ease; }\n' +
'.cta-button:hover { transform: scale(1.02); }\n' +
'.cta-button.outline { background: transparent; border: 2px solid var(--color-white); color: var(--color-white); }\n' +

// Footer - v4.1.7: Updated grid for 2 columns (removed Quick Links), white non-bold contact text
'.footer { background: #53565A; color: var(--color-white); padding: 30px 40px; }\n' +
'.footer-content { display: grid; grid-template-columns: 2fr 1fr; gap: 30px; }\n' +
'.footer-tagline { font-size: 14px; opacity: 0.8; line-height: 1.6; margin-top: 10px; }\n' +
'.footer-heading { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; color: var(--color-white); }\n' +
'.footer-contact p { font-size: 14px; margin-bottom: 6px; color: rgba(255,255,255,0.8); font-weight: 400; }\n' +
'.footer-contact p strong { font-weight: 400; color: rgba(255,255,255,0.8); }\n' +
'.footer-contact a { color: rgba(255,255,255,0.8); text-decoration: none; font-weight: 400; }\n' +
'.footer-contact a:hover { color: var(--color-white); text-decoration: underline; }\n' +
'.footer-bottom { margin-top: 24px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; font-size: 12px; opacity: 0.7; }\n' +

// Utility classes
'.text-right { text-align: right; }\n' +
'.text-center { text-align: center; }\n' +
'.hidden { display: none !important; }\n' +
'.mt-4 { margin-top: 24px; }\n' +
'.mb-4 { margin-bottom: 24px; }\n' +

// Responsive styles - v4.0.4: Hide PDF button, show phone on mobile
'@media (max-width: 768px) {\n' +
'    .header { padding: 24px; }\n' +
'    .header-top { flex-direction: column; gap: 16px; }\n' +
'    .header-contact { display: flex; flex-direction: column; gap: 8px; }\n' +
'    .header-contact a[href^="mailto"] { display: none; }\n' +
'    .btn-download-pdf { display: none !important; }\n' +
'    .greeting { font-size: 22px; }\n' +
'    .customer-info-grid { grid-template-columns: 1fr; gap: 24px; }\n' +
'    .trust-badges { grid-template-columns: repeat(2, 1fr); padding: 20px; gap: 16px; }\n' +
'    .badge-icon-img { width: 56px; height: 56px; margin-bottom: 8px; }\n' +
'    .badge-icon { width: 56px; height: 56px; margin-bottom: 8px; }\n' +
'    .badge-title { font-size: 13px; }\n' +
'    .badge-subtitle { font-size: 13px; }\n' +
'    .main-content { padding: 24px; }\n' +
'    .product-card-inner { grid-template-columns: 1fr; }\n' +
'    .product-item { flex-direction: column; padding: 15px 0; }\n' +
'    .product-item-image { flex: 0 0 auto; width: 100%; margin-right: 0; margin-bottom: 15px; }\n' +
'    .product-item-features { grid-template-columns: 1fr; }\n' +
'    .product-sidebar { align-items: center; }\n' +
'    .product-card-body { grid-template-columns: 1fr !important; gap: 16px !important; }\n' +
'    .product-image-column { width: 100% !important; align-items: center !important; order: 2 !important; }\n' +
'    .product-features-column { order: 1 !important; }\n' +
'    .product-image { width: 100% !important; max-width: 250px !important; }\n' +
'    .product-features-grid { grid-template-columns: 1fr 1fr; }\n' +
'    .design-benefit-grid { grid-template-columns: 1fr; }\n' +
'    /* v4.1.9: Technology subsection price elements - centered/stacked on mobile */\n' +
'    .category-cost-card, .ufh-price-card, .hp-price-card { flex-direction: column !important; align-items: center !important; text-align: center !important; gap: 12px !important; padding: 25px 20px !important; }\n' +
'    .category-cost-row, .ufh-price-row, .hp-price-row { flex-direction: column !important; align-items: center !important; text-align: center !important; gap: 8px !important; }\n' +
'    .category-cost-label, .ufh-price-label, .hp-price-label { font-size: 18px !important; text-align: center !important; margin-bottom: 8px !important; }\n' +
'    .category-cost-value, .ufh-price-amount, .hp-price-amount { font-size: 32px !important; text-align: center !important; margin-bottom: 4px !important; }\n' +
'    .category-cost-vat, .ufh-price-vat, .hp-price-vat { font-size: 16px !important; display: inline !important; margin-left: 4px !important; }\n' +
'    .total-breakdown { grid-template-columns: 1fr; gap: 16px; }\n' +
'    .design-importance-content { grid-template-columns: 1fr; }\n' +
'    .design-badges { grid-template-columns: 1fr; }\n' +
'    .upgrades-grid { grid-template-columns: 1fr; }\n' +
'    .also-need-grid { grid-template-columns: repeat(2, 1fr); }\n' +
'    .stages-container { grid-template-columns: repeat(2, 1fr); gap: 40px; }\n' +
'    .dotted-line { display: none; }\n' +
'    .next-steps-grid { grid-template-columns: repeat(2, 1fr); gap: 24px; }\n' +
'    .footer-content { grid-template-columns: 1fr; gap: 24px; }\n' +
'    .cta-banner { flex-direction: column; text-align: center; gap: 20px; }\n' +
'    .cta-buttons { flex-direction: column; width: 100%; }\n' +
'    .cta-button { text-align: center; }\n' +
'    .thermostat-tiles-container { grid-template-columns: 1fr; gap: 0; border-top: none; border-bottom: none; padding: 0; }\n' +
'    .thermostat-tile { border-top: 1px solid #D3D3D3; border-bottom: 1px solid #D3D3D3; padding: 15px 0; min-height: auto; }\n' +
'    .thermostat-tile + .thermostat-tile { border-top: none; }\n' +
// v4.3.9: Mini product cards mobile responsive
// v4.3.15: Fixed mobile stacking for thermostat upgrade cards - override cards-3/cards-4 specificity
'    .mini-product-cards-container { grid-template-columns: 1fr !important; gap: 16px; border-top: none; border-bottom: none; padding: 0; }\n' +
'    .mini-product-cards-container.cards-3, .mini-product-cards-container.cards-4 { grid-template-columns: 1fr !important; }\n' +
'    .mini-product-card { padding: 16px; border-top: 1px solid #D3D3D3; border-radius: 0; box-shadow: none; }\n' +
'    .mini-product-card:first-child { border-top: 1px solid #D3D3D3; }\n' +
'    .mini-product-card:last-child { border-bottom: 1px solid #D3D3D3; }\n' +
'    .mini-product-card.recommended { border: none; border-top: 1px solid #D3D3D3; border-left: 3px solid var(--color-primary); padding-left: 13px; }\n' +
'    .mini-card-recommended-badge { position: static; transform: none; display: inline-block; margin-bottom: 12px; }\n' +
'    .mini-card-image { height: 150px; }\n' +
'    .design-upgrade-card { flex-direction: column; padding: 30px 20px; gap: 30px; }\n' +
'    .design-upgrade-image { flex: 0 0 auto; width: 100%; order: -1; }\n' +
'    .design-upgrade-benefits { flex-direction: column; gap: 20px; }\n' +
'    .design-upgrade-benefit { flex-direction: row; gap: 15px; align-items: center; }\n' +
'    .design-upgrade-benefit .benefit-icon { width: 36px; height: 36px; flex-shrink: 0; }\n' +
'    .design-upgrade-benefit .benefit-icon svg { width: 30px; height: 30px; }\n' +
'    .design-importance-with-video { flex-direction: column; gap: 20px; }\n' +
'    .design-importance-video { flex: 0 0 auto; width: 100%; }\n' +
'    .design-importance-video iframe { height: 200px; }\n' +
'    .design-credentials { flex-direction: column; gap: 25px; padding-top: 20px; }\n' +
'    .credential-item { padding: 0; }\n' +
'    .credential-divider { display: none; }\n' +
'    .credential-text { font-size: 15px; }\n' +
'    .greeting-row { gap: 20px; flex-direction: column; }\n' +
'    .greeting-text { width: 100%; }\n' +
'    .greeting-h1 { font-size: 28px; line-height: 1.2; word-break: break-word; white-space: normal; }\n' +
'    .greeting-h2 { font-size: 20px; line-height: 1.3; word-break: break-word; white-space: normal; }\n' +
'    .header-content { padding: 20px; }\n' +
'    /* v4.1.6: Standardized mobile padding for all section headers */\n' +
'    .collapsible-header { padding: 36px 16px !important; }\n' +
'    .collapsible-header h2 { font-size: 28px !important; }\n' +
'    .recommendations-header { padding: 36px 16px !important; }\n' +
'    .recommendations-header h2 { font-size: 28px !important; }\n' +
'    .project-spec-header { padding: 36px 16px !important; }\n' +
'    .project-spec-header h2 { font-size: 28px !important; }\n' +
'    /* v4.3.20: Standardized teal section headers for mobile */\n' +
'    .ufh-tree-title, .hp-tree-title, .category-title, .project-spec-group-header, .thermostat-options-header { font-size: 24px !important; }\n' +
'    .upgrades-header { padding: 36px 16px !important; }\n' +
'    .upgrades-header h2 { font-size: 28px !important; }\n' +
'    /* v4.1.5: Mobile-only centered/stacked layout for total sections */\n' +
'    .top-total-section, .total-section { padding: 30px 20px !important; }\n' +
'    .top-total-header, .total-header { flex-direction: column !important; align-items: center !important; text-align: center !important; }\n' +
'    .top-total-left, .total-left { text-align: center !important; margin-bottom: 20px !important; }\n' +
'    .top-total-right, .total-right { text-align: center !important; }\n' +
'    .top-total-amount, .total-amount { font-size: 36px !important; text-align: center !important; }\n' +
'    /* v4.1.7: Heat pump performance mobile layout */\n' +
'    .heat-pump-performance .performance-content-wrapper { flex-direction: column; gap: 20px; }\n' +
'    .heat-pump-performance .performance-data { flex: 1; width: 100%; min-width: 0; }\n' +
'    /* v4.2.1: Important Notes mobile layout - reverted to pre-v4.2.0 */\n' +
'    .important-info-toggle { padding: 14px 16px !important; }\n' +
'    .important-info-toggle h4 { font-size: 14px !important; }\n' +
'    .important-info-content { padding: 16px !important; }\n' +
'    .note-title { font-size: 14px !important; }\n' +
'    .note-description { font-size: 14px !important; }\n' +
'    /* v4.2.2: Quick links stacked in single centered column on mobile */\n' +
'    .quick-links { flex-direction: column !important; align-items: center !important; gap: 12px !important; padding: 20px 16px !important; }\n' +
'    .quick-links-label { text-align: center !important; margin-bottom: 8px !important; }\n' +
'    .quick-links a { width: 80% !important; max-width: 280px !important; padding: 12px 20px !important; text-align: center !important; display: block !important; }\n' +
'    .quick-links-divider { display: none !important; }\n' +
'    /* v4.2.3: Component breakdown width matches commissioning cost card on mobile */\n' +
'    .component-breakdown { width: 100% !important; margin: 20px auto 0 auto !important; }\n' +
'    .component-breakdown-header { width: 100% !important; margin: 0 !important; }\n' +
'    .component-breakdown-table { width: 100% !important; }\n' +
'    .component-breakdown-table th { text-align: left !important; }\n' +
'    /* v4.3.8: Responsive logo sizing - 34px on mobile */\n' +
'    .logo-area .nuheat-logo { height: 34px !important; }\n' +
'    .footer-logo .nuheat-logo { height: 34px !important; }\n' +
'}\n' +

// Mobile breakpoint for phones (480px and below)
'@media (max-width: 480px) {\n' +
'    .greeting-h1 { font-size: 24px; line-height: 1.2; }\n' +
'    .greeting-h2 { font-size: 18px; line-height: 1.3; }\n' +
'    .header-content { padding: 16px; }\n' +
'}\n' +

// ============================================
// UNIVERSAL DESIGN IMPROVEMENTS
// ============================================

// Thermostat tile titles - match product card header style
'.thermostat-tile-title { font-size: 20px !important; font-weight: 600 !important; color: var(--color-text) !important; margin-bottom: 8px !important; }\n' +

// Product image border-radius - standardised
'.product-image { border-radius: 8px !important; overflow: hidden !important; }\n' +

// Info block card styling
'.info-block { background: #f5f5f5 !important; border-radius: 8px !important; padding: 20px 24px !important; }\n' +
'.info-block h3 { font-size: 15px !important; text-transform: uppercase !important; letter-spacing: 1px !important; color: var(--color-primary) !important; margin-bottom: 12px !important; font-weight: 700 !important; }\n' +

// Section dividers
'.hp-tree-section { border-top: 1px solid #D3D3D3 !important; padding-top: 30px !important; margin-top: 30px !important; }\n' +
'.section > .hp-tree-section:first-child { border-top: none !important; padding-top: 0 !important; margin-top: 0 !important; }\n' +
'.category-section { border-top: 1px solid #D3D3D3 !important; padding-top: 30px !important; margin-top: 30px !important; }\n' +

// Info labels - consistent styling
'.info-label { color: #666 !important; font-weight: 500 !important; }\n' +
'.manager-label { color: #666 !important; font-weight: 500 !important; }\n' +
'.manager-detail a { color: var(--color-primary) !important; }\n' +
'.manager-detail a:hover { text-decoration: underline !important; }\n' +
'.account-manager .manager-detail .manager-label { font-weight: 500 !important; color: #666 !important; font-size: inherit !important; }\n' +

// Features grid spacing
'.product-features-grid { margin-bottom: 12px !important; }\n' +

// Consistent border-radius
'.ufh-price-card, .hp-price-card, .category-cost-card { border-radius: 8px !important; }\n' +
'.component-breakdown-header { border-radius: 8px !important; }\n' +
'.important-info-toggle { border-radius: 8px !important; }\n' +
'.important-info-content { border-radius: 0 0 8px 8px !important; }\n' +

// Project Spec sub-section dividers
'.heating-by-room-section { border-top: 1px solid #D3D3D3 !important; padding-top: 24px !important; margin-top: 24px !important; }\n' +
'.performance-section { border-top: 1px solid #D3D3D3 !important; padding-top: 24px !important; margin-top: 24px !important; }\n' +
'.design-importance-inline { border-top: 1px solid #D3D3D3 !important; padding-top: 24px !important; margin-top: 24px !important; }\n' +

// Terms text left-aligned
'.top-total-terms { text-align: left !important; }\n' +

// ============================================
// MOBILE RESPONSIVE OVERRIDES (max-width: 768px)
// ============================================

'@media (max-width: 768px) {\n' +
// Page container
'.page-container { max-width: 100% !important; box-shadow: none !important; }\n' +
// Header
'.header-top-bar { padding: 20px !important; }\n' +
'.header-top-bar-inner { flex-direction: row !important; align-items: center !important; }\n' +
'.logo-area img { height: 34px !important; }\n' +
'.header-contact { display: flex !important; gap: 8px !important; }\n' +
'.header-contact a[href^="mailto"] { display: none !important; }\n' +
'.header-contact a[href^="/cdn-cgi"] { display: none !important; }\n' +
'.header-contact a:nth-child(2) { display: none !important; }\n' +
'.btn-download-pdf { display: none !important; }\n' +
'.header-contact a[href^="tel"] { padding: 0 !important; font-size: 14px !important; font-weight: 600 !important; background: none !important; border: none !important; border-radius: 0 !important; }\n' +
// Greeting
'.header-content { padding: 28px 20px 12px !important; }\n' +
'.greeting-row { gap: 8px !important; flex-direction: column !important; margin-bottom: 0 !important; }\n' +
'.greeting-text { width: 100% !important; display: flex !important; flex-direction: column !important; }\n' +
'.greeting-h1 { font-size: 24px !important; line-height: 1.2 !important; margin-bottom: 22px !important; margin-top: 4px !important; }\n' +
'.greeting-h2 { font-size: 16px !important; font-weight: 400 !important; color: #666 !important; margin-bottom: 8px !important; order: -1 !important; line-height: 1.3 !important; margin-top: 0 !important; }\n' +
// Customer info
'.customer-info-grid { grid-template-columns: 1fr !important; gap: 12px !important; margin-bottom: 8px !important; }\n' +
'.customer-info-grid > .info-block:nth-child(2) { padding-left: 0 !important; }\n' +
'.info-block { background: #f5f5f5 !important; border-radius: 8px !important; padding: 16px !important; }\n' +
'.info-block h3 { font-size: 11px !important; text-transform: uppercase !important; letter-spacing: 1px !important; color: var(--color-primary) !important; margin-bottom: 10px !important; font-weight: 700 !important; }\n' +
'.customer-info-grid .info-block { padding: 16px !important; background: #f5f5f5 !important; border-radius: 8px !important; }\n' +
'.customer-info-grid .info-block:nth-child(2) { padding-left: 16px !important; }\n' +
'.info-item { display: flex !important; flex-direction: column !important; margin-bottom: 6px !important; padding: 0 !important; font-size: 14px !important; line-height: 1.4 !important; }\n' +
'.info-label { font-size: 13px !important; color: #666 !important; font-weight: 500 !important; margin-bottom: 1px !important; margin-right: 0 !important; }\n' +
'.info-value { font-size: 15px !important; }\n' +
'.account-manager { padding: 0 !important; margin: 0 !important; }\n' +
'.account-manager .manager-info { padding: 0 !important; margin: 0 !important; gap: 0 !important; }\n' +
'.manager-detail { display: flex !important; flex-direction: column !important; margin-bottom: 6px !important; padding: 0 !important; font-size: 15px !important; font-weight: 400 !important; line-height: 1.4 !important; }\n' +
'.manager-label { font-size: 13px !important; color: #666 !important; font-weight: 500 !important; margin-bottom: 1px !important; margin-right: 0 !important; display: block !important; }\n' +
'.manager-detail a { color: var(--color-primary) !important; font-weight: 500 !important; font-size: 14px !important; }\n' +
'.account-manager .manager-detail { font-size: 15px !important; font-weight: 400 !important; color: #333 !important; margin-bottom: 6px !important; padding: 0 !important; display: flex !important; flex-direction: column !important; line-height: 1.4 !important; }\n' +
'.account-manager .manager-detail .manager-label { font-weight: 500 !important; font-size: 13px !important; color: #666 !important; margin-right: 0 !important; display: block !important; margin-bottom: 1px !important; }\n' +
// Trust badges
'.trust-badges { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; padding: 8px 0 4px 0 !important; gap: 16px 16px !important; border-top: none !important; border-bottom: none !important; margin: 0 0 0 0 !important; }\n' +
'.trust-badge { display: flex !important; flex-direction: column !important; align-items: center !important; text-align: center !important; padding: 0 !important; min-width: 0 !important; gap: 4px !important; background: none !important; }\n' +
'.badge-icon-img { width: 48px !important; height: 48px !important; margin-bottom: 0 !important; }\n' +
'.badge-icon { width: 48px !important; height: 48px !important; margin-bottom: 0 !important; }\n' +
'.badge-icon svg { width: 28px !important; height: 28px !important; }\n' +
'.badge-title { font-size: 13px !important; font-weight: 400 !important; line-height: 1.3 !important; color: #333 !important; margin-bottom: 0 !important; }\n' +
'.badge-subtitle { font-size: 13px !important; font-weight: 400 !important; line-height: 1.3 !important; color: #333 !important; margin-top: -2px !important; }\n' +
// Green price box
'.top-total-section { padding: 16px 20px !important; margin-top: 20px !important; }\n' +
'.top-total-header { flex-direction: column !important; align-items: center !important; text-align: center !important; }\n' +
'.top-total-left { text-align: center !important; margin-bottom: 8px !important; }\n' +
'.top-total-right { text-align: center !important; }\n' +
'.top-total-title { font-size: 26px !important; line-height: 1.2 !important; white-space: nowrap !important; }\n' +
'.top-total-amount { font-size: 32px !important; text-align: center !important; margin-bottom: 0 !important; }\n' +
'.top-total-breakdown { margin-top: 4px !important; }\n' +
'.top-total-terms { font-size: 12px !important; margin-top: 8px !important; }\n' +
// Accordion headers
'.collapsible-header { padding: 24px 16px !important; }\n' +
'.collapsible-header h2 { font-size: 24px !important; line-height: 1.4 !important; }\n' +
'.main-content { padding: 24px !important; }\n' +
// Product cards - mobile layout
'.product-card { padding: 20px 0 26px 0 !important; margin: 0 !important; }\n' +
'.product-name { margin-top: 0 !important; margin-bottom: 8px !important; }\n' +
'.product-card-body { display: flex !important; flex-direction: column !important; gap: 0px !important; margin: 0 !important; padding: 0 !important; align-items: stretch !important; height: auto !important; }\n' +
'.product-features-column { display: contents !important; height: auto !important; flex: none !important; }\n' +
'.product-features-column .product-description { order: 1 !important; margin-bottom: 16px !important; font-size: 15px !important; }\n' +
'.product-image-column { order: 2 !important; width: 100% !important; display: flex !important; flex-direction: column !important; align-items: stretch !important; padding: 0 !important; margin-top: 8px !important; margin-bottom: 20px !important; }\n' +
'.product-image { width: 100% !important; max-width: 100% !important; aspect-ratio: 3/2 !important; display: flex !important; border-radius: 8px !important; }\n' +
'.product-features-column .product-features-grid { order: 3 !important; grid-template-columns: 1fr 1fr !important; margin-top: 0 !important; margin-bottom: 20px !important; flex: none !important; }\n' +
'.product-features-column .view-datasheet { order: 4 !important; display: inline-flex !important; margin: 0 !important; padding: 0 !important; font-size: 14px !important; line-height: 1 !important; }\n' +
'.product-feature { font-size: 13px !important; }\n' +
'.product-feature-icon { width: 20px !important; height: 20px !important; }\n' +
'.product-feature-icon svg { width: 18px !important; height: 18px !important; }\n' +
// Quick links
'.quick-links { flex-direction: column !important; align-items: center !important; gap: 0px !important; padding: 6px 16px 12px !important; margin-bottom: 20px !important; }\n' +
'.quick-links-label { text-align: center !important; margin-bottom: 2px !important; }\n' +
'.quick-links a { width: auto !important; max-width: none !important; padding: 2px 16px !important; text-align: center !important; display: inline-block !important; min-height: 32px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; }\n' +
'.quick-links-divider { display: none !important; }\n' +
// v4.3.20: Standardized teal section headers for print/mobile
'.ufh-tree-title, .hp-tree-title, .category-title, .project-spec-group-header, .thermostat-options-header { font-size: 24px !important; }\n' +
// Section spacing
'.ufh-tree-section { margin-bottom: 0 !important; margin-top: 0 !important; }\n' +
'.hp-tree-section { margin-bottom: 0 !important; border-top: 1px solid #D3D3D3 !important; padding-top: 20px !important; margin-top: 26px !important; }\n' +
'.section > .hp-tree-section:first-child { border-top: none !important; padding-top: 0 !important; margin-top: 0 !important; }\n' +
'.category-section { border-top: 1px solid #D3D3D3 !important; padding-top: 20px !important; margin-top: 26px !important; margin-bottom: 0 !important; }\n' +
'.section { margin-bottom: 0 !important; }\n' +
// Price/cost boxes
'.ufh-price-card { margin-top: 0 !important; }\n' +
'.hp-price-card { margin-top: 0 !important; }\n' +
'.category-cost-card { margin-top: 0 !important; }\n' +
'.category-cost-card, .ufh-price-card, .hp-price-card { flex-direction: column !important; align-items: center !important; text-align: center !important; gap: 12px !important; padding: 25px 20px !important; }\n' +
'.category-cost-row, .ufh-price-row, .hp-price-row { flex-direction: column !important; align-items: center !important; text-align: center !important; gap: 8px !important; }\n' +
// Project Specification
'#project-spec-content > div { padding: 20px 24px !important; }\n' +
'.project-spec-header { margin-top: 0 !important; padding: 24px 16px !important; }\n' +
'.project-spec-header h2 { font-size: 24px !important; line-height: 1.4 !important; }\n' +
'.heating-by-room-section { border-top: 1px solid #D3D3D3 !important; padding-top: 20px !important; margin-top: 20px !important; margin-bottom: 20px !important; }\n' +
'.performance-section { border-top: 1px solid #D3D3D3 !important; padding-top: 20px !important; margin-top: 20px !important; margin-bottom: 20px !important; }\n' +
'.design-importance-inline { border-top: 1px solid #D3D3D3 !important; padding-top: 20px !important; margin-top: 20px !important; margin-bottom: 20px !important; }\n' +
'.heat-pump-performance .performance-content-wrapper { flex-direction: column !important; gap: 20px !important; }\n' +
'.heat-pump-performance .performance-data { width: 100% !important; min-width: 0 !important; }\n' +
// Design importance - mobile column layout
'.design-importance-with-video { flex-direction: column !important; gap: 20px !important; }\n' +
'.design-importance-video { flex: 0 0 auto !important; width: 100% !important; }\n' +
// Upgrades & Offers
'#upgrades-content > .upgrade-options { padding: 20px 24px !important; }\n' +
'.upgrades-header { margin-top: 0 !important; padding: 24px 16px !important; }\n' +
'.upgrades-header h2 { font-size: 24px !important; line-height: 1.4 !important; color: white !important; }\n' +
'.thermostat-tiles-container { grid-template-columns: 1fr !important; gap: 0 !important; border-top: none !important; border-bottom: none !important; padding: 0 !important; margin: 0 !important; }\n' +
'.thermostat-tile { padding: 20px 0 !important; min-height: auto !important; border-bottom: 1px solid #D3D3D3 !important; border-top: none !important; }\n' +
'.thermostat-tile:first-child { border-top: none !important; }\n' +
'.thermostat-tile:last-child { border-bottom: none !important; }\n' +
'.thermostat-tile div[style*="aspect-ratio"] { width: 100% !important; border-radius: 8px !important; }\n' +
'.upgrade-category { margin-bottom: 20px !important; padding-bottom: 0 !important; border-bottom: none !important; }\n' +
'.upgrade-category:last-child { margin-bottom: 0 !important; }\n' +
'.upgrade-category > p { margin-bottom: 8px !important; }\n' +
'.upgrades-section-description { margin-bottom: 20px !important; font-size: 15px !important; }\n' +
'.thermostat-tile-benefits { margin-bottom: 10px !important; flex: none !important; }\n' +
'.thermostat-tile-link { padding: 4px 0 !important; min-height: 44px !important; display: inline-flex !important; align-items: center !important; }\n' +
'.thermostat-tile:last-child { padding-bottom: 12px !important; }\n' +
// What happens next
'.what-happens-next-section { padding: 20px 24px 24px !important; margin: 0 !important; border-top: 1px solid #D3D3D3 !important; }\n' +
'.what-happens-next-section .section-title { font-size: 24px !important; font-weight: 600 !important; color: var(--color-primary) !important; margin-bottom: 20px !important; margin-top: 4px !important; }\n' +
'.stages-container { grid-template-columns: 1fr !important; gap: 0 !important; }\n' +
'.stage-item { display: grid !important; grid-template-columns: 48px 1fr !important; grid-template-rows: auto auto !important; gap: 0 14px !important; padding: 18px 0 !important; border-bottom: 1px solid #e8e8e8 !important; align-items: start !important; }\n' +
'.stage-item:last-child { border-bottom: none !important; padding-bottom: 0 !important; }\n' +
'.stage-item:hover { transform: none !important; }\n' +
'.stage-number-row { grid-column: 1 !important; grid-row: 1 / 3 !important; width: auto !important; margin-bottom: 0 !important; padding-top: 2px !important; }\n' +
'.stage-number { width: 42px !important; height: 42px !important; font-size: 18px !important; }\n' +
'.dotted-line { display: none !important; }\n' +
'.stage-title { grid-column: 2 !important; grid-row: 1 !important; font-size: 16px !important; font-weight: 700 !important; margin-bottom: 4px !important; line-height: 1.3 !important; padding-top: 2px !important; }\n' +
'.stage-description { grid-column: 2 !important; grid-row: 2 !important; font-size: 14px !important; line-height: 1.6 !important; color: #666 !important; }\n' +
// CTA banner
'.cta-banner { display: flex !important; flex-direction: column !important; text-align: center !important; gap: 16px !important; padding: 24px !important; }\n' +
'.cta-text h3 { font-size: 18px !important; }\n' +
'.cta-text p { font-size: 14px !important; }\n' +
'.cta-buttons { flex-direction: column !important; width: 100% !important; gap: 10px !important; }\n' +
'.cta-button { width: 100% !important; text-align: center !important; padding: 14px 20px !important; border-radius: 8px !important; font-size: 15px !important; box-sizing: border-box !important; }\n' +
// Tap targets
'.view-datasheet { min-height: 44px !important; display: inline-flex !important; align-items: center !important; padding: 8px 0 !important; }\n' +
// Important info
'.important-info-section { margin-top: 20px !important; }\n' +
'.important-info-toggle { padding: 14px 16px !important; border-radius: 8px !important; }\n' +
'.important-info-toggle h4 { font-size: 14px !important; }\n' +
'.important-info-content { padding: 16px !important; border-radius: 0 0 8px 8px !important; }\n' +
'.note-item:not(:first-child) { margin-top: 16px !important; padding-top: 12px !important; }\n' +
'.note-title { font-size: 14px !important; font-weight: 700 !important; margin-bottom: 6px !important; }\n' +
// Font consistency
'.section-intro { font-size: 15px !important; line-height: 1.6 !important; }\n' +
'.ufh-tree-intro, .hp-tree-intro { font-size: 15px !important; line-height: 1.6 !important; }\n' +
'.category-intro { font-size: 15px !important; line-height: 1.6 !important; }\n' +
// Component breakdown
'.component-breakdown { margin-top: 16px !important; }\n' +
'.component-breakdown-header { padding: 12px 16px !important; border-radius: 8px !important; }\n' +
'.component-breakdown-header h3 { font-size: 14px !important; }\n' +
// Footer
'.footer { padding: 24px !important; }\n' +
'.footer-content { grid-template-columns: 1fr !important; gap: 16px !important; }\n' +
'.footer-bottom { margin-top: 16px !important; padding-top: 14px !important; }\n' +
'.footer-contact p { margin-bottom: 4px !important; font-size: 13px !important; }\n' +
'.footer-heading { font-size: 13px !important; margin-bottom: 8px !important; }\n' +
'.footer-tagline { font-size: 13px !important; margin-top: 6px !important; }\n' +
'.footer-bottom p { font-size: 11px !important; line-height: 1.5 !important; }\n' +
'}\n' +

// Print styles
'@media print {\n' +
'    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }\n' +
'    body { background: white; font-size: 12px; }\n' +
'    .page-container { box-shadow: none; max-width: 100%; }\n' +
'    .header-actions, .quick-links { display: none !important; }\n' +
'    .btn { display: none !important; }\n' +
'    .section { page-break-inside: avoid; }\n' +
'    .product-card { page-break-inside: avoid; box-shadow: none; border-top: 1px solid #D3D3D3; border-bottom: 1px solid #D3D3D3; border-left: none; border-right: none; }\n' +
'    .product-item { page-break-inside: avoid; }\n' +
'    .total-section { page-break-inside: avoid; }\n' +
'    .design-importance { page-break-inside: avoid; }\n' +
'    .next-steps-section { page-break-before: always; }\n' +
'    .cta-banner { display: none !important; }\n' +
'}\n';
        }

        function generateJS() {
            return '\n' +
'document.addEventListener("DOMContentLoaded", function() {\n' +
'    // PDF download button\n' +
'    var printBtn = document.querySelector(".btn-download-pdf");\n' +
'    if (printBtn) {\n' +
'        printBtn.addEventListener("click", function(e) {\n' +
'            e.preventDefault();\n' +
'            window.print();\n' +
'        });\n' +
'    }\n' +
'\n' +
'    // Quick links smooth scroll\n' +
'    var links = document.querySelectorAll(".quick-links a[href^=\\"#\\"]");\n' +
'    links.forEach(function(link) {\n' +
'        link.addEventListener("click", function(e) {\n' +
'            e.preventDefault();\n' +
'            var targetId = this.getAttribute("href").substring(1);\n' +
'            var target = document.getElementById(targetId);\n' +
'            if (target) {\n' +
'                target.scrollIntoView({ behavior: "smooth", block: "start" });\n' +
'            }\n' +
'        });\n' +
'    });\n' +
'\n' +
'    // Price breakdown toggles\n' +
'    var toggles = document.querySelectorAll(".price-breakdown-toggle");\n' +
'    toggles.forEach(function(toggle) {\n' +
'        toggle.addEventListener("click", function() {\n' +
'            this.classList.toggle("open");\n' +
'            var content = this.nextElementSibling;\n' +
'            if (content) {\n' +
'                content.classList.toggle("open");\n' +
'            }\n' +
'        });\n' +
'    });\n' +
'\n' +
'    // Important information toggle - v4.2.3: Fixed arrow direction (▶ collapsed, ▼ expanded)\n' +
'    var infoToggle = document.querySelector(".important-info-toggle");\n' +
'    if (infoToggle) {\n' +
'        infoToggle.addEventListener("click", function() {\n' +
'            this.classList.toggle("open");\n' +
'            var content = this.nextElementSibling;\n' +
'            var arrow = this.querySelector(".important-info-arrow");\n' +
'            if (content) {\n' +
'                content.classList.toggle("open");\n' +
'            }\n' +
'            if (arrow) {\n' +
'                arrow.textContent = this.classList.contains("open") ? "▼" : "▶";\n' +
'            }\n' +
'        });\n' +
'    }\n' +
'});\n' +
'\n' +
'// Component Breakdown toggle function (v4.0.9): Arrow = ▶ when collapsed, ▼ when expanded (no CSS rotation)\n' +
'function toggleComponentBreakdown() {\n' +
'    var content = document.getElementById("component-breakdown-content");\n' +
'    var toggleBtn = document.getElementById("component-toggle-btn");\n' +
'    \n' +
'    if (content && toggleBtn) {\n' +
'        content.classList.toggle("open");\n' +
'        \n' +
'        if (content.classList.contains("open")) {\n' +
'            toggleBtn.textContent = "▼";  // Down arrow when expanded\n' +
'        } else {\n' +
'            toggleBtn.textContent = "▶";  // Right arrow when collapsed\n' +
'        }\n' +
'    }\n' +
'}\n' +
'\n' +
'// v3.7.0 - Collapsible major sections toggle function\n' +
'function toggleSection(sectionId) {\n' +
'    var content = document.getElementById(sectionId + "-content");\n' +
'    var icon = document.getElementById(sectionId + "-icon");\n' +
'    \n' +
'    if (content && icon) {\n' +
'        content.classList.toggle("collapsed");\n' +
'        icon.classList.toggle("collapsed");\n' +
'    }\n' +
'}\n';
        }

        function renderHeader(quoteData) {
            var header = quoteData.header;
            var salesRep = quoteData.salesRep;
            var systemInfo = quoteData.systemInfo;

            // v3.7.0: Removed account manager photo from greeting section (per user request)
            // Contact info is still shown in the "Your Account Manager" section below

            var systemTagHtml = '';
            if (systemInfo.isMultiSystem) {
                systemTagHtml = '<span class="system-tag">' + escapeHtml(systemInfo.tagText) + '</span>';
            } else if (systemInfo.isSingleSystem) {
                systemTagHtml = '<span class="system-tag" style="background: var(--color-purple);">' + escapeHtml(systemInfo.tagText) + '</span>';
            }

            return '\n' +
// Section 1: Teal Top Bar
'<div class="header-top-bar">\n' +
'    <div class="header-top-bar-inner">\n' +
'        <div class="logo-area">\n' +
'            <img src="' + NUHEAT_LOGO_BASE64 + '" alt="Nu-Heat - Feel the difference" class="nuheat-logo" style="height: 40px !important; width: auto !important; max-height: none !important; max-width: none !important;">\n' +
'        </div>\n' +
'        <div class="header-actions">\n' +
'            <div class="header-contact">\n' +
'                <a href="tel:' + escapeHtml(salesRep.phone) + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' + escapeHtml(salesRep.phone) + '</a>\n' +
'                <a href="mailto:' + escapeHtml(salesRep.email) + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4l-10 8L2 4"/></svg>' + escapeHtml(salesRep.email) + '</a>\n' +
'            </div>\n' +
'            <button class="btn btn-secondary btn-download-pdf">\n' +
'                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>\n' +
'                Print quote\n' +
'            </button>\n' +
'        </div>\n' +
'    </div>\n' +
'</div>\n' +

// Section 2: White Header Content - v4.0.4: Restructured welcome message, updated account manager
'<header class="header-content">\n' +
'    <div class="greeting-row">\n' +
'        <div class="greeting-text">\n' +
'            <h2 class="greeting-h2">Hi' + (header.customerFirstName ? ' ' + escapeHtml(header.customerFirstName) : '') + ' here is your</h2>\n' +
'            <h1 class="greeting-h1">personalised quote</h1>\n' +
'        </div>\n' +
'    </div>\n' +
'    <div class="customer-info-grid">\n' +
'        <div class="info-block">\n' +
'            <h3>Customer Information</h3>\n' +
'            <div class="info-item">\n' +
'                <span class="info-label">Customer name:</span>\n' +
'                <span class="info-value">' + escapeHtml(header.customerName) + '</span>\n' +
'            </div>\n' +
(header.projectAddress ? 
'            <div class="info-item">\n' +
'                <span class="info-label">Project address:</span>\n' +
'                <span class="info-value">' + escapeHtml(header.projectAddress) + '</span>\n' +
'            </div>\n' : '') +
'            <div class="info-item">\n' +
'                <span class="info-label">System reference:</span>\n' +
'                <span class="info-value">' + escapeHtml(header.tranId) + '</span>\n' +
'            </div>\n' +
'            <div class="info-item">\n' +
'                <span class="info-label">Quote date:</span>\n' +
'                <span class="info-value">' + escapeHtml(header.tranDate) + '</span>\n' +
'            </div>\n' +
(header.expiryDate ? 
'            <div class="info-item">\n' +
'                <span class="info-label">Expiry date:</span>\n' +
'                <span class="info-value">' + escapeHtml(header.expiryDate) + '</span>\n' +
'            </div>\n' : '') +
'        </div>\n' +
'        <div class="info-block">\n' +
'            <h3>Your Account Manager</h3>\n' +
'            <div class="account-manager">\n' +
'                <div class="manager-info">\n' +
'                    <div class="manager-detail"><span class="manager-label">Name:</span> ' + escapeHtml(salesRep.name) + '</div>\n' +
'                    <div class="manager-detail"><span class="manager-label">Email:</span> <a href="mailto:' + escapeHtml(salesRep.email) + '">' + escapeHtml(salesRep.email) + '</a></div>\n' +
'                    <div class="manager-detail"><span class="manager-label">Phone:</span> <a href="tel:' + escapeHtml(salesRep.phone) + '">' + escapeHtml(salesRep.phone) + '</a></div>\n' +
'                </div>\n' +
'            </div>\n' +
'        </div>\n' +
'    </div>\n' +
'</header>';
        }

        function renderTrustBadges() {
            // Base64 encoded icons (v3.5.2 - 160px optimized for 80px display)
            var guaranteedIcon = 'data:image/png;base64,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';
            var insuranceIcon = 'data:image/png;base64,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';
            var lifetimeIcon = 'data:image/png;base64,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';
            var ratedIcon = 'data:image/png;base64,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';
            
            return '\n' +
'<section class="trust-badges">\n' +
'    <div class="trust-badge">\n' +
'        <img src="' + guaranteedIcon + '" alt="Guaranteed Performance" class="badge-icon-img">\n' +
'        <div class="badge-title">Guaranteed</div>\n' +
'        <div class="badge-subtitle">Performance</div>\n' +
'    </div>\n' +
'    <div class="trust-badge">\n' +
'        <img src="' + insuranceIcon + '" alt="Insurance Backed" class="badge-icon-img">\n' +
'        <div class="badge-title">Insurance</div>\n' +
'        <div class="badge-subtitle">Backed</div>\n' +
'    </div>\n' +
'    <div class="trust-badge">\n' +
'        <img src="' + lifetimeIcon + '" alt="Lifetime Tech Support" class="badge-icon-img">\n' +
'        <div class="badge-title">Lifetime Tech</div>\n' +
'        <div class="badge-subtitle">Support</div>\n' +
'    </div>\n' +
'    <div class="trust-badge">\n' +
'        <img src="' + ratedIcon + '" alt="Rated Excellent on Trustpilot" class="badge-icon-img">\n' +
'        <div class="badge-title">Rated Excellent</div>\n' +
'        <div class="badge-subtitle">on Trustpilot</div>\n' +
'    </div>\n' +
'</section>';
        }

        function renderTopTotalSection(quoteData) {
            var header = quoteData.header;
            var symbol = header.currencySymbol;

            var discountHtml = '';
            if (header.hasDiscount && header.discountTotal > 0) {
                discountHtml = '        <div class="top-total-breakdown-item">Discount: -' + symbol + formatNumber(header.discountTotal) + '</div>\n';
            }

            return '\n' +
'<section class="top-total-section">\n' +
'    <div class="top-total-header">\n' +
'        <div class="top-total-left">\n' +
'            <h1 class="top-total-title">Your total system price</h1>\n' +
'            <p class="top-total-terms">This quotation is subject to our terms and conditions</p>\n' +
'        </div>\n' +
'        <div class="top-total-right">\n' +
'            <div class="top-total-amount">' + symbol + formatNumber(header.subtotal) + ' <span class="top-total-plus-vat">plus VAT</span></div>\n' +
'            <div class="top-total-breakdown">\n' +
                 discountHtml +
'                <div class="top-total-breakdown-item">VAT: ' + symbol + formatNumber(header.taxTotal) + '</div>\n' +
'                <div class="top-total-breakdown-item top-total-inc-vat">Total inc VAT: ' + symbol + formatNumber(header.total) + '</div>\n' +
'            </div>\n' +
'        </div>\n' +
'    </div>\n' +
'</section>';
        }

        // v3.7.0 - Updated to collapsible section
        function renderRecommendationsHeader() {
            return '\n' +
'<div class="collapsible-section">\n' +
'    <div class="collapsible-header recommendations-header" onclick="toggleSection(\'recommendations\')">\n' +
'        <h2>Recommended Solutions and Costs</h2>\n' +
'        <span class="collapsible-toggle" id="recommendations-icon">▼</span>\n' +
'    </div>\n' +
'    <div class="collapsible-content" id="recommendations-content">';
        }
        
        function renderRecommendationsFooter() {
            return '</div>\n</div>'; // Close collapsible-content and collapsible-section
        }

        function renderQuickLinks(quoteData) {
            var groupedItems = quoteData.groupedItems;
            var links = [];
            
            if (groupedItems['Underfloor heating'].length > 0) {
                links.push('<a href="#ufh-section">Underfloor heating</a>');
            }
            if (groupedItems['Heat Pump'].length > 0) {
                links.push('<a href="#heat-pump-section">Heat Pump</a>');
            }
            if (groupedItems['Solar thermal'].length > 0) {
                links.push('<a href="#solar-section">Solar thermal</a>');
            }
            if (groupedItems['Commissioning'].length > 0) {
                links.push('<a href="#commissioning-section">Commissioning</a>');
            }
            
            if (links.length === 0) {
                return '';
            }
            
            return '\n' +
'<nav class="quick-links">\n' +
'    <span class="quick-links-label">Quick links to product sections:</span>\n' +
'    ' + links.join(' <span class="quick-links-divider">|</span> ') + '\n' +
'</nav>';
        }

        function renderProductSections(quoteData) {
            var groupedItems = quoteData.groupedItems;
            var categoryTotals = quoteData.categoryTotals;
            var symbol = quoteData.header.currencySymbol;
            var header = quoteData.header;
            
            var html = '\n<section class="section">\n';

            // UFH Section with tree structure (v3.6.0)
            if (groupedItems['Underfloor heating'].length > 0) {
                html += renderUFHTreeSection(quoteData);
            }

            // Heat Pump (v3.7.6 - using tree structure with subsections)
            if (groupedItems['Heat Pump'].length > 0) {
                html += renderHeatPumpTreeSection(quoteData);
            }

            // Solar thermal (v4.3.42: consolidated filtering via filterForRender)
            var solarItems = filterForRender(groupedItems['Solar thermal'], 'SOLAR');
            if (solarItems.length > 0) {
                // v4.3.38: Solar price = Total quote price (subtotal) minus Commissioning subtotal
                var commTotal = (categoryTotals['Commissioning'] && categoryTotals['Commissioning'].total) || 0;
                var solarDisplayPrice = header.subtotal - commTotal;
                var solarTotalsOverride = { count: categoryTotals['Solar thermal'].count, total: solarDisplayPrice, formatted: symbol + formatNumber(solarDisplayPrice) };
                html += renderCategorySection('solar-section', 'Solar thermal',
                    'Nu-Heat solar thermal systems arrive as complete, ready-to-install packages. From collectors and cylinders to bespoke layouts and heat-losses, everything needed for a simple install is included. For the full item list, see your Component Breakdown.',
                    solarItems, solarTotalsOverride, symbol, 'Your solar price', header, false, false);
            }


            // Commissioning (v4.3.42: consolidated filtering via filterForRender)
            var commissioningItems = filterForRender(groupedItems['Commissioning'], 'COMMISSIONING');
            if (commissioningItems.length > 0) {
                html += renderCategorySection('commissioning-section', 'Commissioning',
                    'Your quote includes a commissioning visit from one of our specialist Field Engineers. This essential service unlocks the Boiler Upgrade Scheme (BUS) payment and provides a full handover, ensuring complete confidence.',
                    commissioningItems, categoryTotals['Commissioning'], symbol, 'Your commissioning price', header, false, false);
            }

            // Component Breakdown (v4.0.9 - collapsible section showing ALL line items)
            // Arrow: ▶ when collapsed, ▼ when expanded (handled by JavaScript, no CSS rotation)
            html += '\n<div class="component-breakdown">\n' +
'    <div class="component-breakdown-header" onclick="toggleComponentBreakdown()">\n' +
'        <button class="component-breakdown-toggle" id="component-toggle-btn">▶</button>\n' +
'        <h3>Component Breakdown</h3>\n' +
'    </div>\n' +
'    <div class="component-breakdown-content" id="component-breakdown-content">\n' +
'        <table class="component-breakdown-table">\n' +
'            <thead>\n' +
'                <tr>\n' +
'                    <th class="qty-col">Qty</th>\n' +
'                    <th class="name-col">Part Name</th>\n' +
'                    <th>Description</th>\n' +
'                </tr>\n' +
'            </thead>\n' +
'            <tbody>\n';
            // Loop through ALL line items
            quoteData.lineItems.forEach(function(item) {
                html += '                <tr>\n' +
'                    <td>' + item.quantity + '</td>\n' +
'                    <td>' + escapeHtml(item.itemName) + '</td>\n' +
'                    <td>' + escapeHtml(item.description || '-') + '</td>\n' +
'                </tr>\n';
            });
            html += '            </tbody>\n' +
'        </table>\n' +
'    </div>\n' +
'</div>\n';

            html += '</section>';
            return html;
        }

        /**
         * Render UFH section with tree structure (v3.6.0)
         */
        function renderUFHTreeSection(quoteData) {
            var ufhItemsRaw = quoteData.groupedItems['Underfloor heating'];
            var symbol = quoteData.header.currencySymbol;
            
            // v4.3.32: Defense-in-depth - re-filter UFH items to ONLY include items
            // with product type IDs explicitly listed in PRODUCT_CATEGORY_MAP.UFH
            // v4.3.33/v4.3.34: Also exclude items with productTypeText matching EXCLUDED_PRODUCT_CATEGORIES
            // v4.3.42: Consolidated category render-filtering
            var ufhItems = filterForRender(ufhItemsRaw, 'UFH');
            
            
            // v4.3.38: ufhPrice variable removed — UFH section no longer displays a subsection price
            
            // v3.8.5: Filter items by product type ID - reordered
            // Order: Floor Construction (ID 2) → Electrical/Thermostats (IDs 47,48,23,24,22) → Manual (ID 25)
            // v4.3.7: Fixed to use UFH_SUBCATEGORY_MAP.ELECTRICAL for all thermostat types (not just ID 47)
            var floorConstructionItems = filterItemsByProductTypeId(ufhItems, UFH_SUBCATEGORY_MAP.FLOOR_CONSTRUCTION);
            var thermostatItems = filterItemsByProductTypeId(ufhItems, UFH_SUBCATEGORY_MAP.ELECTRICAL);
            var manualItems = filterItemsByProductTypeId(ufhItems, UFH_SUBCATEGORY_MAP.MANUAL);
            
            var html = '\n' +
'<div class="ufh-tree-section" id="ufh-section">\n' +
'    <h2 class="ufh-tree-title">Underfloor Heating</h2>\n' +
'    <p class="ufh-tree-intro">Nu-Heat systems arrive as complete, ready-to-install packages. From manifolds and thermostats, to bespoke pipe layouts and heat-losses, everything needed for a simple installation is included. For the full item list, see your Component Breakdown.</p>\n';

            // v3.8.5: No subsection headers - products flow naturally
            // Order 1: Floor Construction items (ID 2)
            // v4.3.4: Pass true to show quantity in m² format for floor construction items
            floorConstructionItems.forEach(function(item) {
                html += renderProductCard(item, true);
            });

            // Order 2: Electrical/Thermostat items (IDs 47, 48, 23, 24, 22) - v4.3.7
            thermostatItems.forEach(function(item) {
                html += renderProductCard(item);
            });

            // Order 3: Manual items (ID 25) — skip design package items, render normally
            manualItems.forEach(function(item) {
                // Skip MPDP-C and MPDPCD-C — these are rendered as special design package cards below
                if (String(item.itemId) === DESIGN_PACKAGE_ITEMS.STANDARD_UFH || 
                    String(item.itemId) === DESIGN_PACKAGE_ITEMS.UPGRADE_UFH) {
                    log.audit('UFH_DESIGN_PKG', 'Skipping standard card for design package item: ' + item.itemName + ' (ID=' + item.itemId + ')');
                    return; // Skip — will be rendered as hardcoded card
                }
                html += renderProductCard(item);
            });

            // Design Package card (hardcoded) — after all other Manual items
            // Priority: MPDPCD-C (Design+) takes precedence over MPDP-C (Standard)
            var hasUpgradeDesign = hasDesignPackageItem(quoteData.lineItems, DESIGN_PACKAGE_ITEMS.UPGRADE_UFH);
            var hasStandardDesign = hasDesignPackageItem(quoteData.lineItems, DESIGN_PACKAGE_ITEMS.STANDARD_UFH);

            if (hasUpgradeDesign) {
                html += renderDesignPackageCard('UPGRADE_UFH', quoteData);
                log.audit('UFH_DESIGN_PKG', 'Rendered UPGRADE Design+ card (MPDPCD-C detected)');
            } else if (hasStandardDesign) {
                html += renderDesignPackageCard('STANDARD_UFH', quoteData);
                log.audit('UFH_DESIGN_PKG', 'Rendered STANDARD Design card with upgrade banner (MPDP-C detected)');
            }

            // v3.8.5: Distribution Hardware card removed

            // v4.3.38: UFH price card REMOVED — UFH quotes never display subsection price

            // v3.7.6: Component Breakdown moved to end of Recommended Solutions section
            html += '</div>\n'; // Close ufh-tree-section

            return html;
        }
        
        // v3.8.5: Removed renderDistributionHardwareItem() and renderProductItem() functions
        // UFH section now uses renderProductCard() for consistency with Heat Pump section
        
        /**
         * Render Heat Pump section with tree structure (v3.7.6)
         * Subsections: HP Unit (ID 27), Cylinder (ID 9), HP Accessories (ID 43)
         */
        function renderHeatPumpTreeSection(quoteData) {
            var hpItemsRaw = quoteData.groupedItems['Heat Pump'];
            var symbol = quoteData.header.currencySymbol;
            var header = quoteData.header;
            var categoryTotals = quoteData.categoryTotals['Heat Pump'];
            
            // v4.3.42: Consolidated category render-filtering
            var hpItems = filterForRender(hpItemsRaw, 'HEAT_PUMP');
            
            // Filter items by sub-category using product type IDs
            // HP Unit: ID 27, ASHP: ID 28, GSHP: ID 29
            var hpUnitItems = filterItemsByProductTypeId(hpItems, [27, 28, 29]);
            // Cylinder: ID 9
            var cylinderItems = filterItemsByProductTypeId(hpItems, [9]);
            // HP Accessories: ID 43, HP Controls: ID 44, Buffer Tank: ID 33
            var hpAccessoryItems = filterItemsByProductTypeId(hpItems, [43, 44, 33]);
            
            var html = '\n' +
'<div class="hp-tree-section" id="heat-pump-section">\n' +
'    <h2 class="hp-tree-title">Heat Pump</h2>\n' +
'    <p class="hp-tree-intro">Nu-Heat UFH and heat pump systems arrive as complete, ready-to-install packages. From your buffer tank and cylinder, to bespoke designs, everything needed for a simple install is included. For the full item list, see your Component Breakdown.</p>\n';

            // v3.7.9: Removed subsection headers - products flow together naturally
            // HP Unit items (no subsection header)
            hpUnitItems.forEach(function(item) {
                html += renderProductCard(item);
            });

            // Cylinder items (no subsection header)
            cylinderItems.forEach(function(item) {
                html += renderProductCard(item);
            });

            // HP Accessories (no subsection header)
            hpAccessoryItems.forEach(function(item) {
                html += renderProductCard(item);
            });

            // Heat Pump Design Package card (hardcoded) — always shown in HP section
            html += renderDesignPackageCard('HEAT_PUMP', quoteData);
            log.audit('HP_DESIGN_PKG', 'Rendered Heat Pump Design card');


            // v4.3.38: Heat Pump Price = Total quote price (subtotal) minus Commissioning subtotal
            var commissioningTotal = (quoteData.categoryTotals['Commissioning'] && quoteData.categoryTotals['Commissioning'].total) || 0;
            var hpDisplayPrice = header.subtotal - commissioningTotal;
            html += '    <div class="hp-price-card">\n' +
'        <div class="hp-price-row">\n' +
'            <span class="hp-price-label">Your heat pump price (On-site commissioning priced below):</span>\n' +
'            <span class="hp-price-amount">' + symbol + formatNumber(hpDisplayPrice) + ' <span class="hp-price-vat">plus VAT</span></span>\n' +
'        </div>\n' +
'    </div>\n';

            // Grant banner - v4.2.0: Changed $ to £ icon and "is eligible" to "may be eligible"
            html += '    <div class="hp-grant-banner">\n' +
'        <div class="hp-grant-banner-icon"><span style="font-size: 24px; font-weight: 700;">£</span></div>\n' +
'        <div class="hp-grant-banner-text">\n' +
'            <strong>This system may be eligible for a £7,500 Government grant</strong>\n' +
'            <span>You could save on the cost of a heat pump. Speak to your account manager to see if you are eligible and we\'ll handle the rest.</span>\n' +
'        </div>\n' +
'    </div>\n';

            html += '</div>\n'; // Close hp-tree-section

            return html;
        }
        
        // v4.3.39 - Upgrades & Offers section cleanup
        // REMOVED: "Get Heat Pump Ready!" design upgrade card — no longer shown on any quote type
        // CHANGED: Thermostat options only shown for UFH-only quotes (hidden for Heat Pump and Solar)
        // CHANGED: Entire section hidden if no subsections remain
        function renderUpgradesSection(quoteData) {
            // v4.3.39: Determine whether to show thermostat options
            // Only show for UFH-only quotes (not heat pump, not solar)
            var showThermostatOptions = !quoteData.hasHeatPump && !quoteData.hasSolar;

            // If no subsections to show, return empty string — hide entire section
            if (!showThermostatOptions) {
                return '';
            }

            // v4.3.9: Collect displayed item IDs from quote line items to filter thermostat options
            var displayedItemIds = [];
            if (quoteData.lineItems) {
                quoteData.lineItems.forEach(function(item) {
                    if (item.itemId) {
                        displayedItemIds.push(String(item.itemId));
                    }
                });
            }
            
            // Simple debug logger for this function
            var debugLog = function(category, message, data) {
                log.debug(category, message + (data ? ': ' + JSON.stringify(data) : ''));
            };
            
            var html = '\n' +
'<div class="collapsible-section">\n' +
'    <div class="collapsible-header upgrades-header" onclick="toggleSection(\'upgrades\')">\n' +
'        <h2>Upgrades &amp; Offers</h2>\n' +
'        <span class="collapsible-toggle" id="upgrades-icon">▼</span>\n' +
'    </div>\n' +
'    <div class="collapsible-content" id="upgrades-content">\n' +
'        <div class="upgrade-options" style="padding: 30px 40px;">\n' +
'            <p class="upgrades-section-description">Explore how you can enhance your heating system\'s performance, comfort and efficiency with our offers and upgrades.</p>\n';

            // v4.3.9: Dynamic Thermostat Options - load items from NetSuite catalog
            // Items: DSSB5-C, Neostatwv2-C, NeoAirwv3-C, neoHub+-C
            // Filter out items already displayed in the main UFH section
            html += '            <div class="upgrade-category">\n' +
'                <h2 class="thermostat-options-header">Thermostat options</h2>\n' +
'                <p>Select from our range of controls to enjoy precise control and effortless convenience.</p>\n';

            // Load thermostat option items dynamically
            var thermostatOptions = loadThermostatOptionItems(THERMOSTAT_OPTION_ITEM_IDS, displayedItemIds, debugLog);
            
            // v4.3.26: Sort by order defined in THERMOSTAT_OPTION_ITEM_IDS (not by recommended status)
            thermostatOptions.sort(function(a, b) {
                var indexA = THERMOSTAT_OPTION_ITEM_IDS.indexOf(a.itemId);
                var indexB = THERMOSTAT_OPTION_ITEM_IDS.indexOf(b.itemId);
                // Handle items not in the list (put at end)
                if (indexA === -1) indexA = 999;
                if (indexB === -1) indexB = 999;
                return indexA - indexB;
            });
            
            if (thermostatOptions.length > 0) {
                // v4.3.14: Add dynamic class based on card count for optimal layout
                var cardCountClass = 'cards-' + thermostatOptions.length;
                html += '                <div class="mini-product-cards-container ' + cardCountClass + '">\n';
                thermostatOptions.forEach(function(item) {
                    html += renderMiniProductCard(item);
                });
                html += '                </div>\n';
            } else {
                // Fallback to static content if no items found
                html += '                <div class="thermostat-tiles-container">\n' +
'                    <div class="thermostat-tile">\n' +
'                        <h5 class="thermostat-tile-title">Dial Stats</h5>\n' +
'                        <ul class="thermostat-tile-benefits">\n' +
'                            <li>Easy to use dial interface</li>\n' +
'                            <li>No complex programming</li>\n' +
'                            <li>Perfect for all ages</li>\n' +
'                        </ul>\n' +
'                        <a href="#" class="thermostat-tile-link">View more info</a>\n' +
'                    </div>\n' +
'                    <div class="thermostat-tile">\n' +
'                        <h5 class="thermostat-tile-title">NeoHub</h5>\n' +
'                        <ul class="thermostat-tile-benefits">\n' +
'                            <li>Control from anywhere via mobile app</li>\n' +
'                            <li>Smart home integration</li>\n' +
'                            <li>Energy insights and monitoring</li>\n' +
'                        </ul>\n' +
'                        <a href="#" class="thermostat-tile-link">View more info</a>\n' +
'                    </div>\n' +
'                    <div class="thermostat-tile">\n' +
'                        <h5 class="thermostat-tile-title">NeoAir Wireless</h5>\n' +
'                        <ul class="thermostat-tile-benefits">\n' +
'                            <li>Mains wiring free</li>\n' +
'                            <li>Versatile placement</li>\n' +
'                            <li>Mesh network</li>\n' +
'                        </ul>\n' +
'                        <a href="#" class="thermostat-tile-link">View more info</a>\n' +
'                    </div>\n' +
'                </div>\n';
            }
            
            html += '            </div>\n';

            html += '        </div>\n'; // Close upgrade-options
            html += '    </div>\n'; // Close collapsible-content
            html += '</div>\n'; // Close collapsible-section

            return html;
        }

        /**
         * Render a single product card (for tree structure)
         * @param {Object} item - The item to render
         * @param {boolean} isFloorConstruction - If true, show quantity in format "[Xm²]" (v4.3.4)
         */
        // v3.6.4: Restructured product card - image now aligns with features, not title
        // v4.3.4: Added isFloorConstruction parameter to show quantity for floor construction products
        function renderProductCard(item, isFloorConstruction) {
            var featuresHtml = '';
            if (item.features && item.features.length > 0) {
                featuresHtml = '<div class="product-features-grid">\n';
                item.features.slice(0, 6).forEach(function(feature) {
                    featuresHtml += 
'                    <div class="product-feature">\n' +
'                        <div class="product-feature-icon">' + SVG_CHECKMARK + '</div>\n' +
'                        <span>' + escapeHtml(feature) + '</span>\n' +
'                    </div>\n';
                });
                featuresHtml += '                </div>\n';
            }

            var imageHtml = '';
            if (item.productImage) {
                // v4.0.9: Removed max-height to allow image to span full text height
                imageHtml = '<img src="' + escapeHtml(item.productImage) + '" alt="' + escapeHtml(item.itemName) + '" ' +
                    'onerror="console.error(\'[Image Load Error] ' + escapeHtml(item.itemName) + ': \' + this.src); this.style.display=\'none\';" ' +
                    'onload="console.log(\'[Image Loaded] ' + escapeHtml(item.itemName) + '\');" ' +
                    'style="width: 100%; height: 100%; object-fit: cover;">';
            } else {
                imageHtml = '<div class="product-image-placeholder">' + SVG_IMAGE_PLACEHOLDER + '</div>';
            }

            // v4.1.1: Header has title only, description moved into features column for proper grid constraint
            // v4.3.5: Clean title (no quantity), quantity replaces [XM2] in description for floor construction
            // v4.3.6: Use custitem_quote_product_name for display, fallback to itemName
            var displayName = escapeHtml(item.quoteProductName || item.itemName);
            
            // v4.3.5: Process description - replace [XM2] with actual quantity for floor construction products
            var processedDescription = '';
            if (item.description) {
                processedDescription = escapeHtml(item.description);
                if (isFloorConstruction && item.quantity) {
                    // Format quantity - show as integer if whole number, otherwise show decimal
                    var qty = item.quantity;
                    var formattedQty = (qty === Math.floor(qty)) ? Math.floor(qty) : qty.toFixed(1);
                    // Replace [XM2] with actual quantity - same styling as rest of description
                    processedDescription = processedDescription.replace(/\[XM2\]/gi, '[' + formattedQty + 'm²]');
                }
            }
            
            return '\n' +
'<div class="product-card">\n' +
'    <div class="product-card-header">\n' +
'        <h3 class="product-name">' + displayName + '</h3>\n' +
'    </div>\n' +
'    <div class="product-card-body">\n' +
'        <div class="product-features-column">\n' +
(processedDescription ? '            <p class="product-description">' + processedDescription + '</p>\n' : '') +
            featuresHtml +
(item.dataSheetUrl ?
'            <a href="' + escapeHtml(item.dataSheetUrl) + '" target="_blank" rel="noopener noreferrer" class="view-datasheet">\n' +
'                ' + SVG_EXTERNAL_LINK + '\n' +
'                View more details\n' +
'            </a>\n' : '') +
'        </div>\n' +
'        <div class="product-image-column">\n' +
'            <div class="product-image">' + imageHtml + '</div>\n' +
'        </div>\n' +
'    </div>\n' +
'</div>';
        }

        /**
         * Render a hardcoded Design Package product card.
         * @param {string} type - 'STANDARD_UFH' | 'UPGRADE_UFH' | 'HEAT_PUMP'
         * @param {Object} quoteData - Full quote data (for salesRep email in upgrade banner)
         * @returns {string} HTML string
         */
        function renderDesignPackageCard(type, quoteData) {
            var salesRepEmail = (quoteData.salesRep && quoteData.salesRep.email) || BRAND.contact.email;

            // Card content definitions
            var cards = {
                'STANDARD_UFH': {
                    title: 'Feel The Difference UFH Design',
                    description: 'Everything you need to install UFH with confidence.',
                    image: DESIGN_PACKAGE_IMAGES.STANDARD_UFH,
                    benefits: [
                        { title: 'Install-ready drawings', bullets: ['Bespoke underfloor heating layout showing exactly where to run the pipework.', 'Commissioning guidance including flow rates per port and heat outputs for each room, tailored to floor coverings.'] },
                        { title: 'Step-by-step manuals', bullets: ['Easy to follow installation guidance.', 'Simple user instructions.'] },
                        { title: 'Complete system, no extras', bullets: ['Nu-Heat supplies every UFH component you need. No add-ons, no unexpected costs.'] },
                        { title: 'One point of contact', bullets: ['Dedicated Account Manager with experts on hand.'] },
                        { title: 'Lifetime technical support', bullets: ['Expert support on hand before, during and after installation.'] }
                    ]
                },
                'UPGRADE_UFH': {
                    title: 'Feel The Difference UFH Design+',
                    description: 'UFH design+ for complex projects.',
                    image: DESIGN_PACKAGE_IMAGES.UPGRADE_UFH,
                    benefits: [
                        { title: 'Complete performance peace of mind', bullets: ['Designed to the fabric of the building. We calculate room-by-room heat losses and design the UFH to guarantee heating performance.', 'Optimised for low flow temperatures if pairing with a heat pump now or in the future.'] },
                        { title: 'Install-ready drawings', bullets: ['Bespoke underfloor heating layout showing exactly where to run the pipework.', 'Commissioning guidance including flow rates per port and heat outputs for each room, tailored to floor coverings.'] },
                        { title: 'Step-by-step manuals', bullets: ['Easy to follow installation guidance.', 'Simple user instructions.'] },
                        { title: 'Complete system, no extras', bullets: ['Nu-Heat supplies every component you need. No add-ons, no unexpected costs.'] },
                        { title: 'One point of contact', bullets: ['Dedicated Account Manager with experts on hand.'] },
                        { title: 'Lifetime technical support', bullets: ['Expert support on hand before, during and after installation.'] }
                    ]
                },
                'HEAT_PUMP': {
                    title: 'Feel The Difference Heat Pump Design',
                    description: 'Expert heat pump design. Compliance taken care of.',
                    image: DESIGN_PACKAGE_IMAGES.HEAT_PUMP,
                    benefits: [
                        { title: 'We handle MCS compliance &amp; the Boiler Upgrade Scheme', bullets: ['Nu-Heat manages MCS, Building Control and warranty registration for you.', 'Heat pump sized, positioned and performance-checked to MCS standards.', 'We apply for the &pound;7,500 Boiler Upgrade Scheme for you.', 'And manage any Ofgem evidence and compliance requirements.'] },
                        { title: 'On-site commissioning', bullets: ['A Nu-Heat Engineer visits to commission the heat pump, confirm MCS compliance and handover to the homeowner.'] },
                        { title: 'Install-ready drawings', bullets: ['Detailed heat pump installation drawings and handover pack for a straightforward installation, right first time.'] },
                        { title: 'Step-by-step manuals', bullets: ['Clear and easy installation guidance.', 'Simple user instructions.'] },
                        { title: 'Complete system, no extras', bullets: ['Nu-Heat supplies a complete heat pump installation kit. No add-ons, no unexpected costs.'] },
                        { title: 'Lifetime technical support', bullets: ['Expert support on hand before, during and after installation.'] }
                    ]
                }
            };

            var card = cards[type];
            if (!card) return '';

            // Build benefit cells HTML
            var benefitsHtml = '<div class="design-benefit-grid product-features-grid">\n';
            card.benefits.forEach(function(benefit) {
                benefitsHtml += '<div class="design-benefit-cell">\n' +
                    '<div class="design-benefit-cell-header">' +
                    '<svg class="tick-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
                    '<span>' + benefit.title + '</span></div>\n' +
                    '<ul class="design-benefit-cell-bullets">\n';
                benefit.bullets.forEach(function(bullet) {
                    benefitsHtml += '<li>' + bullet + '</li>\n';
                });
                benefitsHtml += '</ul>\n</div>\n';
            });
            benefitsHtml += '</div>\n';

            // Build upgrade banner HTML (Standard UFH only)
            var upgradeBannerHtml = '';
            if (type === 'STANDARD_UFH') {
                var mailtoLink = 'mailto:' + encodeURIComponent(salesRepEmail) + '?subject=Design%2B%20Upgrade%20Enquiry';
                upgradeBannerHtml =
                    '<div class="upgrade-banner">\n' +
                    '    <div class="upgrade-banner-header"><span class="upgrade-banner-tag">Upgrade</span></div>\n' +
                    '    <div class="upgrade-banner-content">\n' +
                    '        <div class="upgrade-banner-title">Old property or considering a heat pump? Upgrade to UFH Design+</div>\n' +
                    '        <div class="upgrade-banner-desc">We\'ll calculate full room-by-room heat loss calculations for complete performance peace of mind.</div>\n' +
                    '        <a href="' + mailtoLink + '" class="upgrade-banner-cta">Ask your AM to include this</a>\n' +
                    '    </div>\n' +
                    '</div>\n';
            }

            return '\n<div class="product-card">\n' +
                '    <div class="product-card-header">\n' +
                '        <h3 class="product-name">' + card.title + '</h3>\n' +
                '    </div>\n' +
                '    <div class="product-card-body">\n' +
                '        <div class="product-features-column">\n' +
                '            <p class="product-description">' + card.description + '</p>\n' +
                             benefitsHtml +
                '        </div>\n' +
                '        <div class="product-image-column">\n' +
                '            <div class="product-image" style="background: #fff;">' +
                '<img src="' + card.image + '" alt="' + card.title + '" style="width: 100%; height: 100%; object-fit: cover;">' +
                '</div>\n' +
                '        </div>\n' +
                '    </div>\n' +
                upgradeBannerHtml +
                '</div>';
        }


        // v3.6.4: Category section uses same restructured product card layout
        function renderCategorySection(id, title, intro, items, totals, symbol, costLabel, header, showGrantBanner, showPriceBreakdown) {
            // Default showPriceBreakdown to true if not specified
            if (showPriceBreakdown === undefined) showPriceBreakdown = true;
            // v4.3.42: Reuse renderProductCard instead of duplicating card HTML
            var itemsHtml = '';
            items.forEach(function(item) {
                itemsHtml += renderProductCard(item);
            });

            // Price breakdown (v3.7.8: conditionally rendered based on showPriceBreakdown flag)
            var breakdownHtml = '';
            if (showPriceBreakdown && items.length > 0) {
                var rows = '';
                items.forEach(function(item, index) {
                    rows += '<tr><td>' + (index + 1) + '</td><td>' + escapeHtml(item.itemName) + '</td><td>' + escapeHtml(item.description || '-').substring(0, 80) + '</td><td class="text-right">' + symbol + formatNumber(item.amount) + '</td></tr>\n';
                });
                
                breakdownHtml = '\n' +
'<div class="price-breakdown">\n' +
'    <div class="price-breakdown-toggle">Price breakdown: Click to expand <span class="arrow">▼</span></div>\n' +
'    <div class="price-breakdown-content">\n' +
'        <table class="price-breakdown-table">\n' +
'            <thead><tr><th>#</th><th>Item</th><th>Description</th><th class="text-right">Amount</th></tr></thead>\n' +
'            <tbody>' + rows + '</tbody>\n' +
'        </table>\n' +
'    </div>\n' +
'</div>';
            }

            // Grant banner for Heat Pump - v4.2.0: Changed $ to £ icon and "is eligible" to "may be eligible"
            var grantBannerHtml = '';
            if (showGrantBanner) {
                grantBannerHtml = '\n' +
'<div class="grant-banner">\n' +
'    <div class="grant-banner-icon"><span style="font-size: 24px; font-weight: 700;">£</span></div>\n' +
'    <div class="grant-banner-text">\n' +
'        <strong>This system may be eligible for a £7,500 Government grant</strong>\n' +
'        <span>You could save on the cost of a heat pump. Speak to your account manager to see if you are eligible and we\'ll handle the rest.</span>\n' +
'    </div>\n' +
'</div>';
            }

            // v4.0.8: Changed subsection headers from H3 to H2 for consistency
            return '\n' +
'<div class="category-section" id="' + id + '">\n' +
'    <div class="category-header">\n' +
'        <h2 class="category-title">' + escapeHtml(title) + '</h2>\n' +
'        <p class="category-intro">' + escapeHtml(intro) + '</p>\n' +
'    </div>\n' +
    itemsHtml +
'    <div class="category-cost-card">\n' +
'        <div class="category-cost-row">\n' +
'            <div class="category-cost-label">' + escapeHtml(costLabel) + (header.hasDiscount ? '<small>This includes your discount of ' + symbol + formatNumber(header.discountTotal) + '</small>' : '') + '</div>\n' +
'            <div class="category-cost-value">' + totals.formatted + ' <span class="category-cost-vat">plus VAT</span></div>\n' +
'        </div>\n' +
'    </div>\n' +
    breakdownHtml +
    grantBannerHtml +
'</div>';
        }

        function renderTotalSection(quoteData) {
            var header = quoteData.header;
            var symbol = header.currencySymbol;

            // Conditional discount line - only show if discount > 0
            var discountHtml = '';
            if (header.hasDiscount && header.discountTotal > 0) {
                discountHtml = '        <div class="total-breakdown-item">Discount: -' + symbol + formatNumber(header.discountTotal) + '</div>\n';
            }

            return '\n' +
'<section class="total-section">\n' +
'    <div class="total-header">\n' +
'        <div class="total-left">\n' +
'            <h1 class="total-title">Your total system price</h1>\n' +
'            <p class="total-terms">This quotation is subject to our terms and conditions</p>\n' +
'        </div>\n' +
'        <div class="total-right">\n' +
'            <div class="total-amount">' + symbol + formatNumber(header.subtotal) + '</div>\n' +
'            <div class="total-breakdown-list">\n' +
                 discountHtml +
'                <div class="total-breakdown-item">VAT: ' + symbol + formatNumber(header.taxTotal) + '</div>\n' +
'                <div class="total-breakdown-item total-inc-vat">Total inc VAT: ' + symbol + formatNumber(header.total) + '</div>\n' +
'            </div>\n' +
'        </div>\n' +
'    </div>\n' +
'</section>';
        }

        // v3.7.0 - Updated to collapsible section with design importance inside
        function renderProjectSpecSection(quoteData) {
            // Always show this section (it now includes design importance)
            var html = '\n' +
'<div class="collapsible-section">\n' +
'    <div class="collapsible-header project-spec-header" onclick="toggleSection(\'project-spec\')">\n' +
'        <h2>Project Specification</h2>\n' +
'        <span class="collapsible-toggle" id="project-spec-icon">▼</span>\n' +
'    </div>\n' +
'    <div class="collapsible-content" id="project-spec-content">\n' +
'        <div style="padding: 20px 40px;">\n';

            // Only show heating-related content if there's data
            // v4.2.0: Added hasImportantNotes check for new dynamic notes
            if (quoteData.hasRooms || quoteData.hasPerformance || quoteData.hasEstimatorNotes || quoteData.hasImportantNotes) {
                html += '        <p class="section-intro" style="margin-bottom: 20px;">The section includes more detail on how we will design your system for optimum performance.</p>\n';

                // Heating by room (v3.8.0 - use delimited fields table if available, fallback to legacy HTML)
                if (quoteData.hasRooms) {
                    html += '\n' +
'            <div class="heating-by-room-section" style="margin-bottom: 30px;">\n' +
'                <h2 class="project-spec-group-header">Heating by room</h2>\n' +
'                <p style="color: var(--color-text); line-height: 1.6; margin-bottom: 16px;">Review your room-by-room heating plan below for system info, thermostat choices and planned room temperatures.</p>\n';
                    
                    // Prefer new delimited table format if roomsList has data
                    if (quoteData.roomsList && quoteData.roomsList.length > 0) {
                        html += '                <div class="rooms-table-container">\n' +
                            renderHeatingByRoomTable(quoteData.roomsList) + '\n' +
'                </div>\n';
                    } else if (quoteData.roomsHtml && quoteData.roomsHtml.trim().length > 0) {
                        // Fallback to legacy HTML if no delimited data
                        html += '                <div class="rooms-content">\n' +
                            quoteData.roomsHtml + '\n' +
'                </div>\n';
                    }
                    
                    html += '            </div>\n';
                }

                // Performance estimates
                if (quoteData.hasPerformance) {
                    html += '\n' +
'            <div class="performance-section" style="margin-bottom: 30px;">\n' +
'                <h2 class="project-spec-group-header">Renewables performance estimates</h2>\n' +
'                <p class="section-intro">The following performance estimates are calculated based on your property specifications and heating requirements.</p>\n';

                    // v4.1.7: Updated Heat pump energy performance estimate with dynamic fields
                    if (quoteData.hasHeatPump || quoteData.hasHeatPumpPerformance) {
                        var hp = quoteData.heatPumpPerformance || {};
                        var bivalentTemp = hp.bivalentPoint || '-1.2';
                        
                        html += '\n' +
'                <div class="performance-card heat-pump-performance">\n' +
'                    <h4>Heat pump energy performance estimate</h4>\n' +
'                    <div class="performance-content-wrapper">\n' +
'                        <div class="performance-text">\n' +
'                            <p>Nu-Heat\'s heat pump sizing method follows the Microgeneration Certification Scheme\'s guideline, MIS3005. This is sure that the heat pump covers at least 100% of the building heat load for 99% of the average year.</p>\n' +
'                            <p>MIS3005 determines a target outside air temperature of ' + escapeHtml(bivalentTemp) + '°C, where the heat pump must provide all of the space heating without any direct electrical backup. We calculate the building heat load at ' + escapeHtml(bivalentTemp) + '°C outside, and 20°C average inside based on building fabric insulation details supplied to us.</p>\n' +
'                            <p>This quote may be subject to revision at design stage when a more in-depth heat loss calculation and energy simulation will be performed. This can occasionally require that a different heat pump (larger or smaller) is required which may mean we need to re-price the system.</p>\n' +
'                        </div>\n' +
'                        <div class="performance-data">\n' +
'                            <table class="performance-table">\n' +
(hp.heatingScop ? '                                <tr><td class="perf-label">Heating SCoP</td><td class="perf-value">' + escapeHtml(hp.heatingScop) + '</td></tr>\n' : '') +
(hp.hotWaterScop ? '                                <tr><td class="perf-label">Hot water SCoP</td><td class="perf-value">' + escapeHtml(hp.hotWaterScop) + '</td></tr>\n' : '') +
(hp.heatLoad ? '                                <tr><td class="perf-label">Heat load (kW)</td><td class="perf-value">' + escapeHtml(hp.heatLoad) + '</td></tr>\n' : '') +
(hp.heatingRequirement ? '                                <tr><td class="perf-label">Heating requirement (kWH)</td><td class="perf-value">' + escapeHtml(hp.heatingRequirement) + '</td></tr>\n' : '') +
(hp.heatOutput ? '                                <tr><td class="perf-label">Heat output (kWH)</td><td class="perf-value">' + escapeHtml(hp.heatOutput) + '</td></tr>\n' : '') +
(hp.electricityUsed ? '                                <tr><td class="perf-label">Electricity used (kWH)</td><td class="perf-value">' + escapeHtml(hp.electricityUsed) + '</td></tr>\n' : '') +
(hp.backupEnergy ? '                                <tr><td class="perf-label">Back up energy (kWH)</td><td class="perf-value">' + escapeHtml(hp.backupEnergy) + '</td></tr>\n' : '') +
(hp.reheatTime ? '                                <tr><td class="perf-label">Hot water cylinder reheat time (mins)</td><td class="perf-value">' + escapeHtml(hp.reheatTime) + '</td></tr>\n' : '') +
(hp.mcsCertNo ? '                                <tr><td class="perf-label">MCS Certificate number</td><td class="perf-value">' + escapeHtml(hp.mcsCertNo) + '</td></tr>\n' : '') +
'                            </table>\n' +
'                        </div>\n' +
'                    </div>\n' +
'                </div>\n';
                    }

                    // Solar energy performance estimate section removed in v4.1.8

                    html += '            </div>\n';
                }

                // Important information (nested collapsible - starts closed)
                // v4.2.0: Updated to use dynamic content from custbody_quote_note_title/description fields
                if (quoteData.hasImportantNotes || quoteData.hasEstimatorNotes) {
                    html += '\n' +
'            <div class="important-info-section" style="margin-bottom: 30px;">\n' +
'                <div class="important-info-toggle">\n' +
'                    <h4>Important information</h4>\n' +
'                    <span class="important-info-arrow" style="font-size: 18px; color: var(--color-text-light);">▶</span>\n' +
'                </div>\n' +
'                <div class="important-info-content">\n';
                    
                    // v4.2.0: Generate notes from parsed arrays
                    if (quoteData.hasImportantNotes) {
                        var titles = quoteData.importantNotes.titles;
                        var descriptions = quoteData.importantNotes.descriptions;
                        for (var i = 0; i < titles.length; i++) {
                            if (titles[i] && descriptions[i]) {
                                html += '                    <div class="note-item">\n' +
'                        <h3 class="note-title">' + escapeHtml(titles[i]) + '</h3>\n' +
'                        <p class="note-description">' + escapeHtml(descriptions[i]) + '</p>\n' +
'                    </div>\n';
                            }
                        }
                    } else {
                        // Fallback to legacy estimatorNotes HTML
                        html += quoteData.estimatorNotes + '\n';
                    }
                    
                    html += '                </div>\n' +
'            </div>\n';
                }
            }

            // Why is design important (always shown in this section) - v3.9.1: Added YouTube video
            html += '\n' +
'            <div class="design-importance-inline" style="margin-top: 20px;">\n' +
'                <h2 class="project-spec-group-header">Why is design so important?</h2>\n' +
'                <div class="design-importance-with-video">\n' +
'                    <div class="design-importance-text-content">\n' +
'                        <p style="margin-bottom: 12px;">Heating system performance relies on a professional heating design. Our expert design team will ensure your heating system is optimised for efficiency and comfort. We have been designing and supplying heating systems for over 20 years and have supplied over 40,000 systems.</p>\n' +
'                        <p style="margin-bottom: 0;">Getting optimal performance from your underfloor heating starts with expert design. Unlike traditional high temperature radiator systems, underfloor heating is a low temperature system that is set within the floor, meaning a comprehensive design is key to determining its efficiency and effectiveness.</p>\n' +
'                    </div>\n' +
'                    <div class="design-importance-video">\n' +
'                        <iframe width="100%" height="225" src="https://www.youtube.com/embed/nX_tO-22MOY" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: 8px;"></iframe>\n' +
'                    </div>\n' +
'                </div>\n' +
'            </div>\n';

            html += '        </div>\n'; // Close padding div
            html += '    </div>\n'; // Close collapsible-content
            html += '</div>\n'; // Close collapsible-section

            return html;
        }

        function renderDesignImportanceSection() {
            // v3.9.3: Fixed credential icons - using simpler, more reliable inline SVGs
            // Helper function to create credential icon with checkmark badge
            function createCredentialIcon(iconSvg) {
                return '<div style="position: relative; display: inline-block; margin-bottom: 12px;">' +
                    '<div style="width: 70px; height: 70px; display: flex; align-items: center; justify-content: center;">' +
                    iconSvg +
                    '</div>' +
                    '<div style="position: absolute; bottom: 0; right: 0; width: 24px; height: 24px; background: #00857D; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white;">' +
                    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' +
                    '</div>' +
                    '</div>';
            }
            
            // Design icon (pencil and ruler)
            var designIcon = '<svg width="56" height="56" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="12" y="8" width="20" height="36" rx="1" stroke="#1A1A1A" stroke-width="2"/>' +
                '<line x1="16" y1="18" x2="28" y2="18" stroke="#1A1A1A" stroke-width="2"/>' +
                '<line x1="16" y1="26" x2="28" y2="26" stroke="#1A1A1A" stroke-width="2"/>' +
                '<line x1="16" y1="34" x2="28" y2="34" stroke="#1A1A1A" stroke-width="2"/>' +
                '<path d="M38 8L48 18L38 52L34 48V12L38 8Z" stroke="#1A1A1A" stroke-width="2" fill="none"/>' +
                '<circle cx="38" cy="48" r="3" stroke="#00857D" stroke-width="2" fill="#00857D"/>' +
                '</svg>';
            
            // House icon
            var houseIcon = '<svg width="56" height="56" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M30 10L8 28V52H52V28L30 10Z" stroke="#1A1A1A" stroke-width="2" fill="none"/>' +
                '<rect x="24" y="36" width="12" height="16" stroke="#1A1A1A" stroke-width="2" fill="none"/>' +
                '<line x1="8" y1="28" x2="52" y2="28" stroke="#1A1A1A" stroke-width="2"/>' +
                '<circle cx="30" cy="18" r="2" fill="#00857D"/>' +
                '</svg>';
            
            // 30+ years icon (laurel wreath with number)
            var experienceIcon = '<svg width="56" height="56" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M12 48C14 40 16 32 20 26C18 22 18 16 22 14" stroke="#1A1A1A" stroke-width="2" fill="none"/>' +
                '<path d="M48 48C46 40 44 32 40 26C42 22 42 16 38 14" stroke="#1A1A1A" stroke-width="2" fill="none"/>' +
                '<path d="M16 44C18 38 20 34 24 30" stroke="#1A1A1A" stroke-width="2" fill="none"/>' +
                '<path d="M44 44C42 38 40 34 36 30" stroke="#1A1A1A" stroke-width="2" fill="none"/>' +
                '<text x="30" y="36" text-anchor="middle" font-size="16" font-weight="bold" fill="#1A1A1A" font-family="Arial, sans-serif">30+</text>' +
                '</svg>';
            
            // Renewable/fan icon
            var renewableIcon = '<svg width="56" height="56" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<circle cx="30" cy="30" r="18" stroke="#1A1A1A" stroke-width="2" fill="none"/>' +
                '<circle cx="30" cy="30" r="5" stroke="#1A1A1A" stroke-width="2" fill="none"/>' +
                '<line x1="30" y1="8" x2="30" y2="12" stroke="#1A1A1A" stroke-width="2"/>' +
                '<line x1="30" y1="48" x2="30" y2="52" stroke="#1A1A1A" stroke-width="2"/>' +
                '<line x1="8" y1="30" x2="12" y2="30" stroke="#1A1A1A" stroke-width="2"/>' +
                '<line x1="48" y1="30" x2="52" y2="30" stroke="#1A1A1A" stroke-width="2"/>' +
                '<line x1="14.4" y1="14.4" x2="17.2" y2="17.2" stroke="#1A1A1A" stroke-width="2"/>' +
                '<line x1="42.8" y1="42.8" x2="45.6" y2="45.6" stroke="#1A1A1A" stroke-width="2"/>' +
                '<line x1="14.4" y1="45.6" x2="17.2" y2="42.8" stroke="#1A1A1A" stroke-width="2"/>' +
                '<line x1="42.8" y1="17.2" x2="45.6" y2="14.4" stroke="#1A1A1A" stroke-width="2"/>' +
                '</svg>';
            
            return '\n' +
'<section class="design-importance">\n' +
'    <div class="design-importance-content">\n' +
'        <h2>Why is heating design so important</h2>\n' +
'        <div class="design-importance-with-video">\n' +
'            <div class="design-importance-text-content">\n' +
'                <p>Getting optimal performance from your underfloor heating starts with expert design. Unlike traditional high temperature radiator systems, underfloor heating is a low temperature system that is set within the floor, meaning a comprehensive design is key to determining it\'s efficiency and effectiveness.</p>\n' +
'                <p>To guarantee performance, we create designs that are tailored to the requirements of every project. Each design considers room-by-room heat-loss calculations, heat output needs and the unique features of the property such as insulation levels, ceiling height and glazing.</p>\n' +
'            </div>\n' +
'            <div class="design-importance-video">\n' +
'                <iframe src="https://www.youtube.com/embed/nX_tO-22MOY" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>\n' +
'            </div>\n' +
'        </div>\n' +
'        <!-- v3.9.3: Fixed credentials icons section -->\n' +
'        <div class="design-credentials">\n' +
'            <div class="credential-item">\n' +
'                <div class="credential-icon">' + createCredentialIcon(designIcon) + '</div>\n' +
'                <div class="credential-text">Bespoke in-house<br>heating design</div>\n' +
'            </div>\n' +
'            <div class="credential-divider"></div>\n' +
'            <div class="credential-item">\n' +
'                <div class="credential-icon">' + createCredentialIcon(houseIcon) + '</div>\n' +
'                <div class="credential-text">80,000+ UFH<br>systems supplied</div>\n' +
'            </div>\n' +
'            <div class="credential-divider"></div>\n' +
'            <div class="credential-item">\n' +
'                <div class="credential-icon">' + createCredentialIcon(experienceIcon) + '</div>\n' +
'                <div class="credential-text">Over 30 years\'<br>heating experience</div>\n' +
'            </div>\n' +
'            <div class="credential-divider"></div>\n' +
'            <div class="credential-item">\n' +
'                <div class="credential-icon">' + createCredentialIcon(renewableIcon) + '</div>\n' +
'                <div class="credential-text">8,000+ renewable<br>systems supplied</div>\n' +
'            </div>\n' +
'        </div>\n' +
'    </div>\n' +
'</section>';
        }

        // v3.7.1: Removed duplicate renderUpgradesSection that contained "Train with Nu-Heat"
        // The active renderUpgradesSection is now at the collapsible section with UFH-style product cards

        // What Happens Next Section - v3.7.3 Simplified (images removed)
        function renderNextStepsSection(quoteData) {
            var salesRep = quoteData.salesRep;
            return '\n' +
'<section class="what-happens-next-section">\n' +
'    <h2 class="section-title">What happens next</h2>\n' +
'    <div class="stages-container">\n' +
'        <!-- Stage 1: Confirm your quote -->\n' +
'        <div class="stage-item">\n' +
'            <div class="stage-number-row">\n' +
'                <div class="stage-number">1</div>\n' +
'                <div class="dotted-line"></div>\n' +
'            </div>\n' +
'            <h3 class="stage-title">Confirm your quote</h3>\n' +
'            <p class="stage-description">Call ' + escapeHtml(salesRep.firstName || salesRep.name) + ' on ' + escapeHtml(salesRep.phone) + ' to discuss your quote. Once you\'re happy with the specification, we\'ll finalise your order and start the next project phase.</p>\n' +
'        </div>\n' +
'        <!-- Stage 2: Bespoke design -->\n' +
'        <div class="stage-item">\n' +
'            <div class="stage-number-row">\n' +
'                <div class="stage-number">2</div>\n' +
'                <div class="dotted-line"></div>\n' +
'            </div>\n' +
'            <h3 class="stage-title">Bespoke design</h3>\n' +
'            <p class="stage-description">Our specialists craft a custom layout tailored to the property. Through meticulous calculations, we ensure optimal performance and a seamless install.</p>\n' +
'        </div>\n' +
'        <!-- Stage 3: Delivery & installation -->\n' +
'        <div class="stage-item">\n' +
'            <div class="stage-number-row">\n' +
'                <div class="stage-number">3</div>\n' +
'                <div class="dotted-line"></div>\n' +
'            </div>\n' +
'            <h3 class="stage-title">Delivery and Install</h3>\n' +
'            <p class="stage-description">We coordinate delivery to match your timeline. Our technical team is on hand to guide you through the manual for a smooth, successful install.</p>\n' +
'        </div>\n' +
'        <!-- Stage 4: Support for life -->\n' +
'        <div class="stage-item">\n' +
'            <div class="stage-number-row">\n' +
'                <div class="stage-number">4</div>\n' +
'                <div class="dotted-line"></div>\n' +
'            </div>\n' +
'            <h3 class="stage-title">Support for life</h3>\n' +
'            <p class="stage-description">From daily use to reducing call outs, our team is always on hand to help. We believe in our systems and offer dedicated technical support for life.</p>\n' +
'        </div>\n' +
'    </div>\n' +
'</section>';
        }

        function renderCtaBanner(quoteData) {
            var salesRep = quoteData.salesRep;
            return '\n' +
'<div class="cta-banner">\n' +
'    <div class="cta-text">\n' +
'        <h3>Call ' + escapeHtml(salesRep.firstName || salesRep.name) + ' on ' + escapeHtml(salesRep.phone) + '</h3>\n' +
'        <p>Ready to proceed? Get in touch to confirm your order or ask any questions.</p>\n' +
'    </div>\n' +
'    <div class="cta-buttons">\n' +
'        <a href="tel:' + escapeHtml(salesRep.phone) + '" class="cta-button">Call Now</a>\n' +
'        <a href="mailto:' + escapeHtml(salesRep.email) + '" class="cta-button outline">Email ' + escapeHtml(salesRep.firstName || 'Us') + '</a>\n' +
'    </div>\n' +
'</div>';
        }

        // v4.1.7: Removed Quick Links section, updated contact text to white non-bold
        function renderFooter(quoteData) {
            return '\n' +
'<footer class="footer">\n' +
'    <div class="footer-content">\n' +
'        <div class="footer-brand">\n' +
'            <div class="footer-logo"><img src="' + NUHEAT_LOGO_BASE64 + '" alt="Nu-Heat - Feel the difference" class="nuheat-logo" style="height: 40px !important; width: auto !important; max-height: none !important; max-width: none !important;"></div>\n' +
'            <p class="footer-tagline">We believe there is a better way to make homes feel incredible. Our experts go further to ensure precise performance with systems that work better.</p>\n' +
'        </div>\n' +
'        <div class="footer-contact">\n' +
'            <h4 class="footer-heading">Contact Us</h4>\n' +
'            <p>Phone: <a href="tel:' + BRAND.contact.phone + '">' + BRAND.contact.phone + '</a></p>\n' +
'            <p>Email: <a href="mailto:' + BRAND.contact.email + '">' + BRAND.contact.email + '</a></p>\n' +
'            <p>Web: <a href="https://' + BRAND.contact.website + '" target="_blank">' + BRAND.contact.website + '</a></p>\n' +
'        </div>\n' +
'    </div>\n' +
'    <div class="footer-bottom">\n' +
'        <p>&copy; ' + new Date().getFullYear() + ' Nu-Heat UK Ltd. All rights reserved. | Nu-Heat UK Ltd, Heathpark House, Devonshire Road, Heathpark Industrial Estate, Honiton, Devon EX14 1SD</p>\n' +
'        <p style="margin-top: 8px;">Quote Reference: ' + escapeHtml(quoteData.header.tranId) + ' | Generated: ' + formatDate(new Date()) + '</p>\n' +
'    </div>\n' +
'</footer>';
        }

        function renderErrorPage(title, message) {
            return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'    <title>Error | Nu-Heat</title>\n' +
'    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">\n' +
'    <style>\n' +
'        * { margin: 0; padding: 0; box-sizing: border-box; }\n' +
'        body { font-family: "Poppins", sans-serif; background: ' + BRAND.colors.background + '; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }\n' +
'        .error-card { background: white; border-radius: 12px; padding: 48px; max-width: 500px; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.1); }\n' +
'        .error-icon { width: 80px; height: 80px; background: ' + BRAND.colors.accent + '; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }\n' +
'        .error-icon svg { width: 40px; height: 40px; stroke: white; }\n' +
'        h1 { color: ' + BRAND.colors.textPrimary + '; font-size: 24px; margin-bottom: 12px; }\n' +
'        p { color: ' + BRAND.colors.textSecondary + '; line-height: 1.6; margin-bottom: 24px; }\n' +
'        .btn { display: inline-block; padding: 12px 24px; background: ' + BRAND.colors.primary + '; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }\n' +
'    </style>\n' +
'</head>\n' +
'<body>\n' +
'    <div class="error-card">\n' +
'        <div class="error-icon">\n' +
'            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n' +
'                <circle cx="12" cy="12" r="10"/>\n' +
'                <line x1="12" y1="8" x2="12" y2="12"/>\n' +
'                <line x1="12" y1="16" x2="12.01" y2="16"/>\n' +
'            </svg>\n' +
'        </div>\n' +
'        <h1>' + escapeHtml(title) + '</h1>\n' +
'        <p>' + escapeHtml(message) + '</p>\n' +
'        <a href="https://www.nu-heat.co.uk/contact/" class="btn">Contact Support</a>\n' +
'    </div>\n' +
'</body>\n' +
'</html>';
        }

        // =====================================================================
        // HELPER FUNCTIONS
        // =====================================================================
        function createError(name, message) {
            return error.create({ name: name, message: message, notifyOff: true });
        }

        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function formatDate(dateValue) {
            if (!dateValue) return '';
            try {
                var date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
                var day = date.getDate().toString().padStart(2, '0');
                var month = (date.getMonth() + 1).toString().padStart(2, '0');
                var year = date.getFullYear();
                return day + '/' + month + '/' + year;
            } catch (e) {
                return String(dateValue);
            }
        }

        function formatNumber(value) {
            if (value === null || value === undefined) return '0.00';
            return parseFloat(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        }

        function getCurrencySymbol(currency) {
            var symbols = { 'GBP': '£', 'USD': '$', 'EUR': '€', 'CAD': 'C$', 'AUD': 'A$' };
            return symbols[currency] || '£';
        }

        function extractFirstName(fullName) {
            if (!fullName) return '';
            var parts = fullName.trim().split(/[\s,]+/);
            if (fullName.includes('(')) {
                return fullName.split('(')[0].trim();
            }
            return parts[0];
        }

        function getInitials(name) {
            if (!name) return 'NH';
            var parts = name.trim().split(/\s+/);
            if (parts.length >= 2) {
                return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
            }
            return name.substring(0, 2).toUpperCase();
        }

        // Note: getFileUrl() is defined earlier (line ~383) and uses file.load() + fileObj.url
        // DO NOT add a duplicate here - it would override the correct implementation

        return { 
            onRequest: onRequest,
            // v4.3.36: Export generateAndSaveHTML for direct module import
            // This allows other server-side scripts (e.g., User Event, Scheduled Script)
            // to call the generation logic directly without an HTTP request
            generateAndSaveHTML: generateAndSaveHTML,
            // v4.3.51: Export version for cross-script diagnostics
            SCRIPT_VERSION: SCRIPT_VERSION
        };
    }
);