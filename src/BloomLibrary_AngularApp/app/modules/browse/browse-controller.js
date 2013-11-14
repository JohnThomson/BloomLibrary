'use strict';

angular.module('BloomLibraryApp.browse')
	.controller('BrowseCtrl', ['$scope', '$dialog', '$timeout', 'bookService', 
	                           function ($scope, $dialog, $timeout, bookService) {

	 bookService.getAllBooksCount().then(function (count) {
	    $scope.numPerPage = 8;
        $scope.noOfPages = Math.ceil(count / $scope.numPerPage);
        $scope.currentPage = 1;
		$scope.bookCount = count;
        $scope.setPage = function () { };
      });

	  // browse.tpl.html listview div configures this to be called as getVisibleItems when user chooses a page.
	  // the listview first configures visItemsFirst and numPerPage.
	  // Todo: should get Filtered book range.
	  $scope.getPage = function () {
		  if (!$scope.visItemsFirst)
			  $scope.visItemsFirst = 0; // in case not initialized, make it a number
		  bookService.getBookRange($scope.visItemsFirst, $scope.numPerPage).then(function(result) {
			  $scope.visibleBooks = result;
		  })
	  };

	  $scope.foo = function(paramOne, paramTwo) {
		  return paramOne + paramTwo;
	  }
      
        
      //$scope.updatePageControl = function () {
      //    $timeout(function ()   	bloomService.getAllBooks().then(function (allBooks) {
      $scope.numPerPage = 8;
//      $scope.noOfPages = Math.ceil(allBooks.length / $scope.numPerPage);
      //wait for 'filteredBooks' to be changed
      //        $scope.noOfPages = Math.ceil($scope.filteredBooks.length / $scope.numPerPage);
      //        $scope.currentPage = 1;
      //        $scope.setPage = function (pageNo) {
      //            $scope.currentPage = pageNo;
      //        };
      //    }, 10);
      //};
      $scope.updatePageControl = function () {
          $scope.noOfPages = Math.ceil($scope.filteredBooks.length / $scope.numPerPage);
          $scope.currentPage = 1;
          $scope.setPage = function (pageNo) {
              $scope.currentPage = pageNo;
          };

      }

      $scope.SearchNow = function () {
          $scope.searchText = $scope.searchTextRaw;
      }
      $scope.matchingBooks = function (book) {
          if (!$scope.searchText)
              return true;
          var s = $scope.searchText.toLowerCase();
          var titleMatch = book.volumeInfo.title.toLowerCase().indexOf(s) != -1;
          var tagMatch = _.contains(book.Tags, s);
          var x = book.volumeInfo.authors.join().toLowerCase();
          var authorMatch = book.volumeInfo.authors.join().toLowerCase().indexOf(s) > -1;
          //$timeout(function () { $scope.updatePageControl()}, 1000);
          return titleMatch | tagMatch | authorMatch;
      };
  }]);

