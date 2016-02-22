'use strict';
var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-67596202-2']);
_gaq.push(['_trackPageview']);
(function() {
  var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
  ga.src = 'https://ssl.google-analytics.com/ga.js';
  var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
})();

// (function(h,o,t,j,a,r){
//        h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
//        h._hjSettings={hjid:100136,hjsv:5};
//        a=o.getElementsByTagName('head')[0];
//        r=o.createElement('script');r.async=1;
//        r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
//        a.appendChild(r);
//    })(window,document,'//static.hotjar.com/c/hotjar-','.js?sv=');


(function(f,b){if(!b.__SV){var a,e,i,g;window.mixpanel=b;b._i=[];b.init=function(a,e,d){function f(b,h){var a=h.split(".");2==a.length&&(b=b[a[0]],h=a[1]);b[h]=function(){b.push([h].concat(Array.prototype.slice.call(arguments,0)))}}var c=b;"undefined"!==typeof d?c=b[d]=[]:d="mixpanel";c.people=c.people||[];c.toString=function(b){var a="mixpanel";"mixpanel"!==d&&(a+="."+d);b||(a+=" (stub)");return a};c.people.toString=function(){return c.toString(1)+".people (stub)"};i="disable track track_pageview track_links track_forms register register_once alias unregister identify name_tag set_config people.set people.set_once people.increment people.append people.track_charge people.clear_charges people.delete_user".split(" ");
for(g=0;g<i.length;g++)f(c,i[g]);b._i.push([a,e,d])};b.__SV=1.2;a=f.createElement("script");a.type="text/javascript";a.async=!0;a.src="https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js";e=f.getElementsByTagName("script")[0];e.parentNode.insertBefore(a,e)}})(document,window.mixpanel||[]);
mixpanel.init("3523d22678914e71ad1e5d45551cd96c");



console.log('\'Allo \'Allo Carol!!!!!!');
var app = angular
    .module('phasedExtention', [
        'ngAnimate',
        // 'ngResource',
        'ngRoute',
        'angular-loading-bar',
        'firebase',
        'angularMoment',
        'ngDialog',
        'toaster'
    ])
    .run(['$rootScope', '$location', function ($rootScope, $location) {
        $rootScope.$on('$routeChangeError', function(event, next, previous, error) {
          // We can catch the error thrown when the $requireAuth promise is rejected
          // and redirect the user back to the home page
          if (error === 'AUTH_REQUIRED') {
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
                    'currentAuth': ['Auth', function(Auth) {
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
                    'currentAuth': ['Auth', function(Auth) {
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
                    'currentAuth': ['Auth', function(Auth) {
                      // $requireAuth returns a promise so the resolve waits for it to complete
                      // If the promise is rejected, it will throw a $stateChangeError (see above)
                      return Auth.fb.$requireAuth();
                    }]
                  }
            });


    });
