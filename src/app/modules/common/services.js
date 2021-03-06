angular.module('BloomLibraryApp.services', ['restangular'])
	.factory('authService', ['Restangular', "$cookies", "errorHandlerService", '$analytics', 'sharedService',
        function (restangular, $cookies, errorHandlerService, $analytics, sharedService) {
		var isLoggedIn = false;
		var userNameX = 'unknown';
        var bookshelves = [];
        var userObjectId = null;
        var saveUserNameTag = 'userName';
        var savePasswordTag = 'password';
        restangular.addResponseInterceptor(function(data, operation, what, url, response, deferred) {
            var extractedData;
            // Restangular expects getList operations to return an array. Parse.com in many cases does not.
            // This interceptor cleans them up.
            if (operation === "getList") {
                if (what == 'login') {
                    // the actual object we want is returned.
                    extractedData = [data];
                }
                else if (url === "http://bloomlibrary.org.s3.amazonaws.com?prefix=installers/") { // s3 bucket listing
                    // the actual object we want is returned.
                    var json= $.xml2json(data);
                    extractedData = [];
                    var items = json.ListBucketResult.Contents;
                    for(i=0; i<items.length;i++){
                        var file = {};
                        file.name = items[i].Key.replace("installers/","");
                        if(file.name.indexOf(".msi")>-1) {
                            file.url = "http://bloomlibrary.org.s3.amazonaws.com/" + items[i].Key;
                            file.date = items[i].LastModified;
                            extractedData.push(file);
                        }
                    }
                }
                else {
                    // the data is typically in the results field of the object returned
                    extractedData = data.results;
                }
            } else {
                extractedData = data;
            }
            return extractedData;
        });
        restangular.setErrorInterceptor(function(response, deferred, responseHandler) {
            // Returning false indicates we wish to prevent any more processing.
            if (response.data && response.data.error) {
                // There is a valid message we wish to display to the user.
                // Let the calling code handle it.
                return true;
            }
            errorHandlerService.handleRestangularError(response);
            return false;
        });

        // These headers are the magic keys for our account at Parse.com
		// While someone is logged on, another header gets added (see setSession).
		// See also the keys below in the Parse.initialize call.
        var headers;
        if (!sharedService.isPublicSite) {
            // we're running somewhere other than the official release of this site...use the silbloomlibrarysandbox api strings
            headers = {
                'X-Parse-Application-Id': 'yrXftBF6mbAuVu3fO6LnhCJiHxZPIdE7gl1DUVGR',
                'X-Parse-REST-API-Key': 'KZA7c0gAuwTD6kZHyO5iZm0t48RplaU7o3SHLKnj'
            };
        }
        else {
            // we're live! Use the real silbloomlibrary api strings.
            headers = {
                'X-Parse-Application-Id': 'R6qNTeumQXjJCMutAJYAwPtip1qBulkFyLefkCE5',
                'X-Parse-REST-API-Key': 'P6dtPT5Hg8PmBCOxhyN9SPmaJ8W4DcckyW0EZkIx'
            };
        }
		restangularConfig = function (restangularConfigurer) {
			restangularConfigurer.setBaseUrl('https://api.parse.com/1'); // 1/indicates rev 1 of parse.com API
			restangularConfigurer.setDefaultHeaders(headers);
		};

		factory = {

			userName: function () { return userNameX; },
			setUserName: function (newName) { userNameX = newName; },
            bookShelves: function() {return bookshelves;},

			isLoggedIn: function () { return isLoggedIn; },
			isUserAdministrator: function () { return isUserAdministrator; },
            userObjectId: function() {return userObjectId;},

			config: function () { return restangularConfig; },

			setSession: function (sessionToken) {
				var sessionTokenKey = 'X-Parse-Session-Token';
				if (sessionToken) {
					headers[sessionTokenKey] = sessionToken;
					isLoggedIn = true;
				}
				else {
					delete headers[sessionTokenKey];
					isLoggedIn = false;
				}
			},

			login: function (username, password, successCallback, errorCallback) {
				// We don't want login to depend on case, so that the user has to remember the exact case with which they signed up.
                // So we make sure (here and elsewhere) that the user names we pass to parse.com are all lower case.
                // So the user can see the name the way they typed it, we don't lower-case the email address; this also means
                // that in case, by any chance, they are using an email tool that is case dependent, emails will use the exact case they typed.
				restangular.withConfig(restangularConfig).all('login').getList({ 'username': username.toLowerCase(), 'password': password })
					.then(function (results) {
                        if (results.length < 1) {return;}
                        var result = results[0];
                        userObjectId = result.objectId;
						isLoggedIn = true;
						isUserAdministrator = result.administrator;
						userNameX = username;
                        // There's no expiration on this...browser will remember your details until you log out, even
                        // if you close the browser altogether. This is not meant to be high-security.
                        $cookies[saveUserNameTag] = username;
                        $cookies[savePasswordTag] = password;
                        
                        $analytics.eventTrack('Log In', {username: username});

                        restangular.withConfig(restangularConfig).all('classes/bookshelf').getList({ 'where':{'owner': {"__type":"Pointer","className":"_User","objectId":result.objectId} }})
                            .then(function (response) {
                                bookshelves = response;
                                if (!response) {bookshelves = [];}
                            });
                        factory.setSession(result.sessionToken); // im not sure this actually works
						successCallback(result);
					},
				function (result) {
					isLoggedIn = false;
					userNameX = 'unknown';
					errorCallback(result);
				});
			},

			logout: function () {
                $analytics.eventTrack('Log Out', {userName: $cookies[saveUserNameTag]});
                
                $cookies[saveUserNameTag] = '';
                $cookies[savePasswordTag] = '';

                isLoggedIn = false;
				factory.setSession('');
			},

			// curl -X POST \
			//	-H "X-Parse-Application-Id: mqNCpJ1nB4a597asLF61OwYclJCOwfzgMNTMF6LL" \
			//  -H "X-Parse-REST-API-Key: QN9bdJ8JODDYxUSXqWZTaz2y8WcX3d5kMi6ha3TU" \
			//  -H "Content-Type: application/json" \
			//  -d '{"email":"coolguy@iloveapps.com"}' \
			//  https://api.parse.com/1/requestPasswordReset
			sendResetPassword: function(email)
			{
				// It took some experimentation to get restangular to make the post we wanted, with
				// fewer elements in the path than expected. There may be a simpler way, but this works.
				// Enhance: is there any need/possibility of detecting errors here?
				// For example, what if it's not a valid email address we know? Or if the network is down?
				return restangular.withConfig(restangularConfig).one("requestPasswordReset").post('', {"email":email});
			}
		};

        var tryUserName = $cookies[saveUserNameTag];
        var tryPassword = $cookies[savePasswordTag];
        if (tryUserName) {
            factory.login(tryUserName, tryPassword, function() {}, function() {});
        }

		return factory;
	} ])

    .service('sharedService', function() {
        this.isPublicSite = window.location.host.indexOf("bloomlibrary.org") === 0;
    })

    .service('bookService', ['Restangular', 'authService', '$q', '$rootScope', 'errorHandlerService', '$analytics', 'sharedService', '$cookies',
        function (restangular, authService, $q, $rootScope, errorHandlerService, $analytics, sharedService, $cookies) {
		// Initialize Parse.com javascript query module for our project.
		// Note: we would prefer to do things in this service using the REST API, but it does not currently support
		// substring matching and other things we need.
		// Please keep using the REST API wherever possible and the javascript API only where necessary.
		// Enhance: it is probably possible to implement server-side functions and access them using REST instead of
		// using the parse.com javascript API. We are limiting use of this API to this one file in order to manage
		// our dependency on parse.com.
        if (!sharedService.isPublicSite) {
            // we're running somewhere other than the official release of this site...use the silbloomlibrarysandbox api strings
            Parse.initialize('yrXftBF6mbAuVu3fO6LnhCJiHxZPIdE7gl1DUVGR', '16SZXB7EhUBOBoNol5f8gGypThAiqagG5zmIXfvn');
        }
        else {
            // we're live! Use the real silbloomlibrary api strings.
            Parse.initialize('R6qNTeumQXjJCMutAJYAwPtip1qBulkFyLefkCE5', 'bAgoDIISBcscMJTTAY4mBB2RHLfkowkqMBMhQ1CD');
        }
		this.getAllBooks = function () {
			return restangular.withConfig(authService.config()).all('classes/books').getList({ "limit": 50 }).then(function (resultWithWrapper) {
				return resultWithWrapper.results;
			});
		};
		this.getAllBooksCount = function () {
			return restangular.withConfig(authService.config()).all('classes/books').getList({ "limit": 0, "count": 1 }).then(function (resultWithWrapper) {
				return resultWithWrapper.count;
			});
		};

        this.getBookshelf = function(shelfName) {
            // This version retrieves a version of the data and is shorter. But we use this object in ways that require
            // it to be an actual parse.com API bookshelf object.
//            return restangular.withConfig(authService.config()).all('classes/bookshelf').getList({ "name": shelfName }).then(function (resultWithWrapper) {
//                return resultWithWrapper.results[0];
//            });
            var defer = $q.defer();
            var query = new Parse.Query('bookshelf');
                query.equalTo("name", shelfName);
            query.find({
                success: function (results) {
                    // I am not clear why the $apply is needed. I got the idea from http://jsfiddle.net/Lmvjh/3/.
                    // There is further discussion at http://stackoverflow.com/questions/17426413/deferred-resolve-in-angularjs.
                    // Maybe it is NOT needed here; copied logic from getFilteredBookRange
                    $rootScope.$apply(function () { defer.resolve(results[0]); });
                },
                error: function (error) {
                    errorHandlerService.handleParseError('getBookshelf', error);
                    defer.reject(error);
                }
            });
            return defer.promise;
        };

        // Returns a promise indicating whether the book is in the shelf
        // We will probably replace this with a different function that returns a list of the shelves a book is on,
        // once we support multiple books. Thus, I haven't particularly tried to make this elegant
        this.isBookInShelf = function(bookId, shelf) {
            var defer = $q.defer();
            var bookshelf = Parse.Object.extend("bookshelf");
            var query = new Parse.Query(bookshelf);
            query.get(shelf.objectId, {
                success: function(javaShelf) {
                    var relation = javaShelf.relation("books");
                    var presentQuery = relation.query();
                    presentQuery.equalTo("objectId", bookId);
                    presentQuery.find({
                        success:function(list) {
                            // Without the $rootScope.$apply, the promise action doesn't happen
                            // until something changes that forces an angular execution cycle.
                            $rootScope.$apply(function () { defer.resolve(list.length > 0);});
                        }
                    });
                },
                error: function(object, error) {                    
                    errorHandlerService.handleParseError('isBookInShelf', error);
                    defer.reject(error);
                }
            });
            return defer.promise;
        };

        // Reverse whether the book is a member of the shelf.
        this.ToggleBookInShelf = function(book, shelf) {
            // This should work (preliminary version...to ADD only) but runs into a bug in Parse,
            // No 'Access-Control-Allow-Origin' header is present on the requested resource.
            // So we use the javascript api
//            restangular.withConfig(authService.config()).one('classes/bookshelf/'+shelf.objectId).post('',
//                {books:{"__op":"AddRelation","objects":[{"__type":"Pointer","className":"books","objectId":book.objectId}]}});
            // the shelf and book objects may be restangular ones, not javascript ones. We need proper javascript API objects.
            // We can simplify this if we use javascript API objects more widely...but I think we may need the JSON-ified
            // objects for the angularJS interaction.
            var bookshelf = Parse.Object.extend("bookshelf");
            var query = new Parse.Query(bookshelf);
            query.get(shelf.objectId, {
                success: function(javaShelf) {
                    var books = Parse.Object.extend("books");
                    var bookQuery = new Parse.Query(books);
                    bookQuery.get(book.objectId, {
                        success: function(javaBook) {
                            var relation = javaShelf.relation("books");
                            var presentQuery = relation.query();
                            presentQuery.equalTo("objectId", book.objectId);
                            presentQuery.find({
                                success:function(list) {
                                    if (list.length > 0) {
                                        relation.remove(javaBook);
                                    }
                                    else {
                                        relation.add(javaBook);
                                    }
                                    javaShelf.save();
                                }
                            });
                        },
                        error: function(object, error) {
                            errorHandlerService.handleParseError('ToggleBookInShelf-book', error);
                        }
                    });
                },
                error: function(object, error) {
                    errorHandlerService.handleParseError('ToggleBookInShelf-shelf', error);
                }
            });
        };

        // Common to getFilteredBooks{Count,Range}...though they do different things if all four params are blank.
        // Return a query the yields books whose title (or tags) contain searchString, if any
        // and whose languages list includes the specified language, if any
        // and whose tags include the specified tag, if any;
        // or, if shelf is specified, return exactly the books in that shelf, ignoring other params.
        this.makeQuery = function(searchString, shelf, lang, tag) {
            var query;
            if (shelf) {
                if (shelf.name == "$recent") {
                    // Special query for recently modified books ("New Arrivals", currently defined as
                    // all books, but sorted to show most recently modified first).
                    query = new Parse.Query('books');
                    query.descending('updatedAt');
                } else if (shelf.name == "$myUploads") {
                    query = new Parse.Query('books');
                    query.equalTo('uploader', {
                        __type: 'Pointer',
                        className: '_User',
                        objectId: authService.userObjectId()
                    });
                }
                else {
                    query = shelf.relation("books").query();
                }
            } else {
                query = new Parse.Query('books');
            }
            if (searchString) {
                query.contains('search', searchString.toLowerCase());
            }
            if (lang) {
                var langQuery = new Parse.Query('language');
                langQuery.equalTo('isoCode', lang);
                query.matchesQuery('langPointers', langQuery);
            }
            if (tag) {
                query.equalTo("tags", tag);
            }
            return query;
        };

		// Gets the count of books we currently want to display.
		// Returns a promise which will deliver the count.
		// The caller will typically do getFilteredBooksCount(...).then(function(count) {...}
		// and inside the scope of the function count will be the book count.
		// See comments in getFilteredBookRange for how the parse.com query is mapped to an angularjs promise.
		this.getFilteredBooksCount = function (searchString, shelf, lang, tag) {
            $analytics.eventTrack('Book Search', {searchString: searchString || '', shelf: (shelf && shelf.name) || '', lang: lang || '', tag: tag || ''});
			var defer = $q.defer();

            var query;
            if (!searchString && !shelf && !lang && !tag) {
                query = new Parse.Query('books'); // good enough for count, we just want them all in some order.
            } else {
                query = this.makeQuery(searchString, shelf, lang, tag);
            }

            query.count({
				success: function (count) {
					$rootScope.$apply(function () { defer.resolve(count); });
				},
				error: function (error) {
                    errorHandlerService.handleParseError('getFilteredBooksCount', error);
					defer.reject(error);
				}
            });

			return defer.promise;
		};

		this.getBookRange = function (first, count) {
			return restangular.withConfig(authService.config()).all('classes/books').getList({ "skip": first, "limit": count }).then(function (resultWithWrapper) {
				return resultWithWrapper.results;
			});
		};

		// We want a subset of the books of current interest.
		// From that set we want up to count items starting at first (0-based).
		// We will return the result as an angularjs promise. Typically the caller will
		// do something like getFilteredBookRange(...).then(function(books) {...do something with books}
		// By that time books will be an array of json-encoded book objects from parse.com.
		this.getFilteredBookRange = function (first, count, searchString, shelf, lang, tag, sortBy, ascending) {
			var defer = $q.defer(); // used to implement angularjs-style promise
            if (!searchString && !shelf && !lang && !tag) {
                // default initial state. Show featured books and then all the rest.
                // This is implemented by cloud code, so just call the cloud function.
                // Enhance: if we want to control sorting for this, we will need to pass the appropriate params
                // to the cloud function.
                Parse.Cloud.run('defaultBooks', { first: first, count: count }, {
                    success: function(results) {
                        // enhance JohnT: a chunk of duplicate code here should be pulled out into a function.
                        var objects = new Array(results.length);
                        for (i = 0; i < results.length; i++) {
                        // If we need the contents (more than objectID) of the uploader field, we will need
                        // something like this...probably some changes to the defaultBooks cloud code, too.
//						// without this the extra fields downloaded by include("uploader") don't get copied to objects.
//						var user = results[i].get("uploader");
//						if (user)
//						{
//							results[i].set("uploader", user.toJSON());
//						}
                            // Before we convert results[i] to JSON, we have to convert its langPointers to JSON.
                            // the data we want is included in the results of defaultBooks, but for some reason
                            // toJSON does not convert the linked objects' extra data.
                            var langArray = results[i].get("langPointers");
                            if (langArray)
                            {
                                var fixedArray = [];
                                for (var j = 0; j < langArray.length; j++) {
                                    //sometimes we remove a row from the languages table but if this book is still
                                    //pointing at it, we'll get a null in the langArray at that point
                                  if (langArray[j] != null) {
                                    fixedArray.push(langArray[j].toJSON());
                                  }
                                }
                                results[i].set("langPointers", fixedArray);
                            }

                            objects[i] = results[i].toJSON();
                        }
                        // I am not clear why the $apply is needed. I got the idea from http://jsfiddle.net/Lmvjh/3/.
                        // There is further discussion at http://stackoverflow.com/questions/17426413/deferred-resolve-in-angularjs.
                        // Without it, the display does not update properly; typically each click updates to what it
                        // should have been after the previous click.
                        $rootScope.$apply(function () { defer.resolve(objects); });
                    },
                    error: function(error) {
                        errorHandlerService.handleParseError('getFilteredBookRange-defaultBooks', error);
                        defer.reject(error);
                    }
                });
                return defer.promise;
            }
            // This is a parse.com query, using the parse-1.2.13.min.js script included by index.html
			var query = this.makeQuery(searchString, shelf, lang, tag);

            query.skip(first);
            query.limit(count);
            query.include("langPointers");
            //query.include("uploader"); // reinstate this and code below if we need contents of uploader
			// Sorting probably works only for top-level complete fields.
			// It does not work for e.g. (obsolete) volumeInfo.title.
            // The $recent shelf is implemented as a special sort, so we need to disable any other for that.
			if (sortBy && (!shelf || shelf.name != '$recent')) {
				if (ascending) {
					query.ascending(sortBy);
				}
				else {
					query.descending(sortBy);
				}
			}
			// query.find returns a parse.com promise, but it is not quite the same api as
			// as an angularjs promise. Instead, translate its find and error functions using the
			// angularjs promise.
			query.find({
				success: function (results) {
					var objects = new Array(results.length);
					for (i = 0; i < results.length; i++) {
						// reinstate this and the line above if we need the contents (more than objectID) of the uploader field.
//						// without this the extra fields downloaded by include("uploader") don't get copied to objects.
//						var user = results[i].get("uploader");
//						if (user)
//						{
//							results[i].set("uploader", user.toJSON());
//						}
                        // Before we convert results[i] to JSON, we have to convert its langPointers to JSON.
                        // including this data in the query above makes sure it is there, but for some reason
                        // toJSON does not convert the linked objects' extra data.
                        var langArray = results[i].get("langPointers");
						if (langArray)
						{
                            var fixedArray = [];
                            for (var j = 0; j < langArray.length; j++) {
                                //sometimes we remove a row from the languages table but if this book is still
                                //pointing at it, we'll get a null in the langArray at that point
                                if (langArray[j] != null) {
                                    fixedArray.push(langArray[j].toJSON());
                                }
                            }
						}

						objects[i] = results[i].toJSON();
					}
					// I am not clear why the $apply is needed. I got the idea from http://jsfiddle.net/Lmvjh/3/.
					// There is further discussion at http://stackoverflow.com/questions/17426413/deferred-resolve-in-angularjs.
					// Without it, the display does not update properly; typically each click updates to what it
					// should have been after the previous click.
					$rootScope.$apply(function () { defer.resolve(objects); });
				},
				error: function (error) {
                    errorHandlerService.handleParseError('getFilteredBookRange', error);
					defer.reject(error);
				}
			});

			return defer.promise;
		};

		this.getBookById = function (id) {
			return restangular.withConfig(authService.config()).one('classes/books', id).get({include:"uploader,langPointers"});
		};

		this.deleteBook = function (id) {
			return restangular.withConfig(authService.config()).one('classes/books', id).remove();
		};

        this.resetCurrentPage = function () {
            $cookies["currentpage"] = 1;
        };
	} ])
    .service('languageService', ['$rootScope', '$q', '$filter', 'errorHandlerService', function($rootScope, $q, $filter, errorHandlerService) {
        var languageList; // Used to cache the list
    
        // We want all the languages we know.
        this.getLanguages = function () {
            var defer = $q.defer(); // used to implement angularjs-style promise

            // This is a parse.com query, using the parse-1.2.13.min.js script included by index.html
            var query = new Parse.Query('language');
            // Configure the query to give the results we want.
            // Enhance: we'd really like to sort by number of books containing it.
            query.ascending("name");
            query.limit(1000); // we want all the languages there are, but this is the most parse will give us.

            // query.find returns a parse.com promise, but it is not quite the same api as
            // as an angularjs promise. Instead, translate its find and error functions using the
            // angularjs promise.
            query.find({
                success: function (results) {
                    var objects = new Array(results.length);
                    for (i = 0; i < results.length; i++) {
                        objects[i] = results[i].toJSON();
                    }
                    languageList = objects;
                    // See the discussion in getFilteredBookRange of why the $apply is used. I haven't tried
                    // NOT using it in this context.
                    $rootScope.$apply(function () { defer.resolve(objects); });
                },
                error: function (error) {
                    errorHandlerService.handleParseError('getLanguages', error);
                    defer.reject(error);
                }
            });

            return defer.promise;
        };
        this.getDisplayName = function(langId) {
            if (languageList) {
                if (langId) {
                    return $filter('filter')(languageList, {isoCode: langId})[0].name;
                } else {
                    return "";
                }
            } else {
                return "";
                // Just in case we haven't gotten the language list yet.
                // Theoretically, this shouldn't happen.  The first load will populate languageList, and
                // we don't need to call getDisplayName until a filter is clicked.
                // There may be a way to guarantee it is loaded first, but I haven't figured it out.
            }
        };
	} ])
    .service('tagService', function() {
        this.getTags = function () {
            return [            
                // Replicated from Bloom.Book.RuntimeInformationInjector.AddUISettingsToDom().
                // Eventually this will be user-extensible and retrieved using a query on some new table.
                "Agriculture", "Animal Stories", "Business", "Culture", "Community Living", "Dictionary", "Environment", "Fiction", "Health", "How To", "Math", "Non Fiction", "Spiritual", "Personal Development", "Primer", "Science", "Story Book", "Traditional Story"
            ].sort();
        };
        this.getDisplayName = function(tagId) {
            return tagId;
        };
    })
	.service('userService', ['Restangular', 'authService', function (restangular, authService) {
		var checkforerror = function (callback) {


		};

		this.register = function (user, callback) {
			if (!user.mandatoryfield) {
                var user1 = $.extend({}, user);
                user1.username = user1.username.toLowerCase();
				return restangular.withConfig(authService.config()).all('users').post(user1).then(callback, callback);
			}
		};

		this.readByUserName = function (username, callback) {
			return restangular.withConfig(authService.config()).all('users').getList({ "where": '{"username": "' + username.toLowerCase() + '"}' }).then(callback, callback);
		};
	} ])
	.service('bookCountService', function () { // service to provide shared access to this object between detail and browse for delete
		var bookCountObject = {bookCount: 0};
		return {
			getCount: function() {
				return bookCountObject;
			}
		};
	})
    .service('errorHandlerService', ['$modal', '$analytics', function ($modal, $analytics) {
        var mostRecentUserMessage = 0; // a timestamp
        
        this.handleParseError = function(call, error) {
            try {
                $analytics.eventTrack('Error - Parse.com', {call: call, error: error});
                this.showUserErrorMessage();
            } catch (ignored) {
                console.log('Exception in handleParseError: ' + ignored);
            }
        };
        this.handleRestangularError = function(response) {
            try {
                // In a couple instances, passwords are returned to us in the response.
                // Attempt to scrub them before sending to analytics.
                // Review: Acceptable risk that the password could be moved to a different location in the json?
                if (response.config && response.config.data && response.config.data.password) {
                    // Error during Sign Up
                    response.config.data.password = 'SCRUBBED';
                }
                if (response.config && response.config.params && response.config.params.password) {
                    // Error during Log In
                    response.config.params.password = 'SCRUBBED';
                }
                $analytics.eventTrack('Error - Restangular', {response: response});
                this.showUserErrorMessage();
            } catch (ignored) {
                console.log('Exception in handleRestangularError: ' + ignored);
            }
        };
        this.showUserErrorMessage = function () {
            var now = Date.now();
            // Don't display a message more than once every 30 seconds
            if (now - mostRecentUserMessage > 30000) {
                mostRecentUserMessage = now;
                $modal.open({
                    templateUrl: 'modules/common/errorMessage.tpl.html',
                    controller: 'errorMessage'
                });
            }
        };
    }]);
