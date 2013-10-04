'use strict';

angular.module('BloomLibraryApp.login')
	.controller('LoginCtrl', ['$scope', '$dialog', '$timeout', 'silNoticeService', 'authService', 
	                          function ($scope, $dialog, $timeout, silNoticeService, authService) {
       	$scope.login = function() {
       		authService.login($scope.username, $scope.password, function(result) {
       			if (result.error) {
	       			silNoticeService.push(silNoticeService.ERROR, result.error);
       			} else {
					silNoticeService.push(silNoticeService.SUCCESS, "Login Successful");
					
					// add session token to defaultHeaders
					authService.setSession(result.sessionToken);
       			}
       		}, function(error) {
       			// catch for login credential failure
       			if (error.status === 404) {
       				if (error.data.code != undefined) {
       					if (error.data.code === 101) {
            	       		silNoticeService.push(silNoticeService.ERROR, 
            	       				"Login Unsuccessful. Check your username and password and try again. Also check the Caps Lock key.");
       					} else {
            	       		silNoticeService.push(silNoticeService.ERROR, error);
       					}
       				} else {
        	       		silNoticeService.push(silNoticeService.ERROR, error);
       				}
       			} else {
    	       		silNoticeService.push(silNoticeService.ERROR, error);
       			}
       			
       		});
       	};
  }]);