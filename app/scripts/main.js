  var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-67596202-2']);
_gaq.push(['_trackPageview']);
(function() {
  var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
  ga.src = 'https://ssl.google-analytics.com/ga.js';
  var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
})();


console.log('\'Allo \'Allo BRIAN!!!!!');
var app = angular
    .module('phasedExtention', [
        'ngAnimate',
        // 'ngResource',
        'ngRoute',
        'angular-loading-bar',
        'firebase',
        'angularMoment',
        'toaster'
    ])
    .run(['$rootScope', '$location', function ($rootScope, $location) {
        $rootScope.$on("$routeChangeError", function(event, next, previous, error) {
          // We can catch the error thrown when the $requireAuth promise is rejected
          // and redirect the user back to the home page
          if (error === "AUTH_REQUIRED") {
            $location.path("/login");
          }
        });
        
    }])
    .config(['cfpLoadingBarProvider', function(cfpLoadingBarProvider) {
        cfpLoadingBarProvider.includeSpinner = true;
    }])
    .constant('FURL', 'https://phaseddev.firebaseio.com/')
    .config(function ($routeProvider) {
        $routeProvider
            .when('/', {
                templateUrl: 'views/main.html',
                controller: 'MainInteractionController',
                resolve: {
                    // controller will not be loaded until $requireAuth resolves
                    // Auth refers to our $firebaseAuth wrapper in the example above
                    "currentAuth": ["Auth", function(Auth) {
                      // $requireAuth returns a promise so the resolve waits for it to complete
                      // If the promise is rejected, it will throw a $stateChangeError (see above)
                      return Auth.fb.$requireAuth();
                    }]
                  }
            })
            .when('/login', {
                templateUrl: 'views/login.html',
                controller: 'LoginController'
            })
            .when('/switchteam', {
                templateUrl: 'views/switchTeam.html',
                controller: 'SwitchTeamController',
                resolve: {
                    // controller will not be loaded until $requireAuth resolves
                    // Auth refers to our $firebaseAuth wrapper in the example above
                    "currentAuth": ["Auth", function(Auth) {
                      // $requireAuth returns a promise so the resolve waits for it to complete
                      // If the promise is rejected, it will throw a $stateChangeError (see above)
                      return Auth.fb.$requireAuth();
                    }]
                  }
            })
            .when('/createteam', {
                templateUrl: 'views/createTeam.html',
                controller: 'CreateTeamController',
                resolve: {
                    // controller will not be loaded until $requireAuth resolves
                    // Auth refers to our $firebaseAuth wrapper in the example above
                    "currentAuth": ["Auth", function(Auth) {
                      // $requireAuth returns a promise so the resolve waits for it to complete
                      // If the promise is rejected, it will throw a $stateChangeError (see above)
                      return Auth.fb.$requireAuth();
                    }]
                  }
            })


    });
