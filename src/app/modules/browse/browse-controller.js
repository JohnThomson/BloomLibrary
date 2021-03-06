(function () { // to wrap use strict
	'use strict';
	angular.module('BloomLibraryApp.browse', ['ui.router', 'restangular'])//, 'BloomLibraryApp.detail'])
	.config(['$stateProvider', function config($stateProvider) {

		$stateProvider.state('browse', {
			//review: I had wanted to have the main view be named, and have the name be 'main', but then nothing would show
			//it's as if the top level view cannot be named. (note that you can specify it by saying views: {'@': 
			url: "/browse?search&shelf&lang&tag",
			templateUrl: 'modules/browse/browse.tpl.html',
			controller: 'BrowseCtrl',
			title: 'Book Library'
		});
	} ])
	//we get a json list like ['me','you'] and we return 'me, you'
	.filter('makeCommaList', function () {
		return function (input) {
			return input == null ? "" : input.join(", ");
		};
	})

	.filter('makeThumbnailUrl', function () {
		return function (baseUrl) {
			if (!baseUrl) {
				return "";
			}
			return baseUrl + "thumbnail-70.png";
		};
	})
	.filter('makeDetailSizedThumbnailUrl', function () {
		return function (baseUrl) {
			if (!baseUrl) {
				return "";
			}
			return baseUrl + "thumbnail-256.png";
		};
	});

	angular.module('BloomLibraryApp.browse')
	.controller('BrowseCtrl', ['$scope', '$timeout', 'bookService', 'languageService', 'tagService', '$state', '$stateParams', 'bookCountService',
								function ($scope, $timeout, bookService, languageService, tagService, $state, $stateParams, bookCountService) {

		$scope.searchText = $stateParams["search"];
        $scope.shelfName = $stateParams["shelf"];
        $scope.lang = $stateParams["lang"];
        $scope.tag = $stateParams["tag"];
        $scope.searchTextRaw = $scope.searchText;
		// if the service book count changes (e.g., because detailView deletes a book),
		// update our scope's bookCount so the list view which is watching it will reload its page.
		$scope.bookCountObject = bookCountService.getCount();
        if (!$scope.initialized) {
            // This helps prevent a count (e.g., from a previous search) continuing to take effect
            // before we have figured out our new count.
            $scope.bookCountObject.bookCount = 0;
        }
		$scope.$watch('bookCountObject.bookCount', function() {
			$scope.bookCount = $scope.bookCountObject.bookCount;
		});
        
        function getBookMessage(count) {
            var message = "";
            var shelfLabel = $scope.shelfName;
            if ($scope.shelfName === 'Featured') {
                shelfLabel = 'Featured';
            } else if ($scope.shelfName === '$recent') {
                shelfLabel = 'New Arrival';
            } else if ($scope.shelfName === '$myUploads') {
                shelfLabel = '\"My Upload\"';
            } else {
                shelfLabel = '';
            }
            shelfLabel = _localize(shelfLabel);
            var booksTranslation = _localize("books");
            var params = {
                count: count,
                shelf: shelfLabel,
                language: languageService.getDisplayName($scope.lang),
                bookOrBooks: booksTranslation,
                tag: tagService.getDisplayName($scope.tag),
                searchText: $scope.searchText
            };
            if (count === 1) {
                params.bookOrBooks = _localize('book');
            }

            if (count === 0) {
                message = _localize('There are no books that match your search for {shelf} {language} books', params);
            } else {
                message = _localize('Found {count} {shelf} {language} {bookOrBooks}', params);
            }
            if ($scope.tag) {
                message = message + " " +_localize('with the {tag} tag', params);
            }
            if ($scope.searchText) {
                message = message + " " + _localize('containing "{searchText}"', params);
            }
            return message;
        }
        $scope.getFilteredBookCount = function() {
            bookService.getFilteredBooksCount($scope.searchText, $scope.shelf, $scope.lang, $scope.tag).then(function (count) {
                $scope.bookCount = $scope.bookCountObject.bookCount = count;
                $scope.bookMessage = getBookMessage(count);
                $scope.setPage = function () {
                };
                $scope.initialized = true;
            });
        };
        // Every path in this 'if' should eventually call getFilteredBookCount(). We can't just move outside
        // because in at least one path we have to wait to call it after a promise is fulfilled.
        if ($scope.shelfName) {
            if ($scope.shelfName.substring(0,1) =='$')
            {
                // Not a real shelf, triggers a special query
                $scope.shelf = {name: $scope.shelfName};
                $scope.getFilteredBookCount();
            }
            else {
                // We need to retrieve the shelf object, and we can't run the query to get the count
                // until we get the result.
                bookService.getBookshelf($scope.shelfName).then(function (shelf) {
                    $scope.shelf = shelf;
                    $scope.getFilteredBookCount();
                });
                // Todo: what if no such shelf??
            }
        }
        else {
            $scope.getFilteredBookCount();
        }

		// browse.tpl.html listview div configures this to be called as pageItemsFunction when user chooses a page.
		$scope.getBookRange = function (first, count) {
            if (!$scope.initialized) {
                return; // can't do useful query.
            }
			bookService.getFilteredBookRange(first, count, $scope.searchText, $scope.shelf, $scope.lang, $scope.tag).then(function (result) {
				$scope.visibleBooks = result;
			});
		};

		$scope.SearchNow = function () {
			// Todo: this needs to run a query on the real database and update bookCount
			// and do something to make the listview invoke getBookRange (even if the bookCount
			// does not change).
            bookService.resetCurrentPage();
			$scope.searchText = $scope.searchTextRaw;
			$state.go('.', { search: $scope.searchText, shelf: "" });
		};
	} ]);
} ());   // end wrap-everything function