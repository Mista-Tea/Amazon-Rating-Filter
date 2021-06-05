/*
    MIT License

    Copyright (c) 2021 Mista-Tea

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/

(function() {
    // Convenience function for waiting until a DOM element has been created
    var waitForElement = function(selector, callback) {
        var e = jQuery(selector);
        if (e.length) {
            callback(e);
        } else {
            setTimeout(() => waitForElement(selector, callback), 100);
        }
    };
    
    /*
     * Listen for changes to the Amazon product title element, which should update
     * whenever the user clicks on a different style/format of product, allowing us
     * to react and fetch reviews for the new selection
     */
    var callback;

    MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

    var observer = new MutationObserver(function(mutations, observer) {
        observer.disconnect();
        callback();
    });

    var observe = function() {
        var target = $('#title_feature_div');
        if (target.length == 0) {
            return; // Navigated to a page that was caught in URL match but wasn't a product homepage?
        }
        
        // The product title children get cleared entirely when the user selects a new style/format, so
        // we should just need to response to childList changes
        observer.observe(target[0], {
            attributes: false,
            childList: true,
            subtree: false,
            characterData: false
        });
    }

    var fetchReviews = function() {
        console.log("Loading selected amazon product's reviews...");
        
        // Wait for the default Amazon star rating element to be created on the page (if necessary)
        waitForElement('#averageCustomerReviews', function(reviewsSection) {
            
            // Grab the product ID from the element attribute
            var asin = reviewsSection.attr('data-asin');
            
            // Construct an array of deferred ajax requests to grab the ratings for each star
            var ajaxReviewUrl = window.location.origin + '/hz/reviews-render/ajax/reviews/get/ref=cm_cr_arp_d_viewopt_sr';
            var ajaxReviewParams = 'formatType=current_format&asin=' + asin + '&filterByStar=';
            var filters = ['five_star', 'four_star', 'three_star', 'two_star', 'one_star'];
            
            var deferrals = filters.map(function(e) {
                return $.ajax({
                    type:     'POST',
                    url:      ajaxReviewUrl,
                    data:     ajaxReviewParams + e,
                    dataType: 'text'
                });
            });
            
            // Fetch results of all star (1-5) ratings, and then build the rating panel under the
            // default Amazon stars and ratings
            $.when(...deferrals).then(function(...responses) {
                
                // Ajax results are delimited by &&& and stored in JSON, so split them up and
                // find the only section we actually care about (filter-info-section has ratings/reviews)
                var ajaxStrings = responses.map(function(response) {
                    return response[0].split('&&&').filter(function(e) {
                        return e.match('filter-info-section');
                    });
                });
                
                // Use regex to parse out the ratings and reviews from this section
                var matches = ajaxStrings.map((e) => e[0].match(/([\d,]+) global ratings?.+\s([\d,]+) global review/));
                
                // Retrieve ratings/reviews from regex groups and remove delimiters
                var validInds = matches.map((e) => e != null);
                matches = matches.map((e) => e != null ? e : ["", "0", "0"]);
                
                var ratingStrings = matches.map((e) => e[1].replaceAll(',',''));
                var reviewStrings = matches.map((e) => e[2].replaceAll(',',''));
                
                // Parse rating/review strings into numbers
                var ratingNums = ratingStrings.map((e) => parseInt(e));
                var reviewNums = reviewStrings.map((e) => parseInt(e));
                
                // Sum the number of ratings/reviews
                var scales = [5, 4, 3, 2, 1];
                
                var numRatings = ratingNums.reduce((a,b) => a + b);
                var numReviews = reviewNums.reduce((a,b) => a + b);
                var sumRatings = ratingNums.map((r,i) => r * scales[i]).reduce((a,b) => a + b);
                
                // How many spaces needed to align all rating values evenly
                var numDigits = Math.max(...ratingStrings.map((e) => e.length));
                
                // Start building the UI elements to display the selected product's ratings
                var itemRatingNum = numRatings != 0 ? (sumRatings / numRatings) : 0;
                var itemRatingStr = itemRatingNum.toLocaleString(undefined, {maximumFractionDigits: 2});
                
                var parent = $('<div>').attr({style: 'line-height: 1.5; margin-bottom: 10px'}).appendTo(reviewsSection);
                
                // Use Amazon's 'star' UI with a value rounded to the nearest 1/2th
                var starStr = (Math.round(itemRatingNum * 2) / 2).toString().replace( '.', '-');
                
                parent.append($('<hr>'));
                parent.append($('<span>').text(`Item rating: `));
                parent.append($('<span>').attr({style: 'font-weight: bold'}).text(itemRatingStr + ' '));
                parent.append($(`<i class='a-icon a-icon-star a-star-${starStr}'>`));
                parent.append($('<div>').text(`${numRatings.toLocaleString()} ratings | ${numReviews.toLocaleString()} reviews`));
                parent.append($('<br/>'));
                
                var tbl = $('<table>').attr({style: 'line-height: 1'}).appendTo(parent);
                
                // Build up the 5/4/3/2/1 star ratings UI
                scales.forEach(function(n,i) {
                    var stars = ('★').repeat(n) + ('☆').repeat(i);
                    var percentNum = 0;
                    var ratingNum = 0;
                    
                    // Ensure the Ajax request was valid before accessing the ratings
                    if (validInds[i] == true) {
                        ratingNum = ratingNums[i];
                        percentNum = (numRatings != 0) ? Math.round((ratingNum / numRatings) * 100.0) : 0;
                    }
                    
                    var ratingStr = ratingNums[i].toLocaleString().padStart(numDigits, ' ');
                    var percentStr = percentNum.toLocaleString().padStart(3);
                    
                    var tr = $('<tr style="white-space: pre; font-family: monospace, monospace;">');
                    tr.append( $('<td>').text(`${stars}: ${ratingStr}`) );
                    
                    var td = $('<td style="width: 100px;">');
                    var bar = $(`<div class="a-meter" role="progressbar" aria-valuenow="${percentNum}%">`);
                    
                    bar.append( $(`<div class="a-meter-bar" style="width: ${percentNum}%;">`) );
                    td.append(bar);
                    tr.append(td);
                    
                    tr.append( $('<td>').text(`${percentStr}%`));
                    
                    if (validInds[i] != true) {
                        tr.append($('<td>').text('(Failed to fetch ratings)'));
                    }
                    
                    tbl.append(tr);
                });
                
                // Now that we've constructed the UI, reconnect the observer to react to selection changes
                observe();
                
            }, (...reason) => console.log('Amazon review filter failed: ', reason));
        });
    };
    
    // Fetch reviews on the intial page load, then connect the observer to listen for selection changes
    fetchReviews();
    callback = fetchReviews;
    observe();
    
})();