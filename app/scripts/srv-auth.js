'use strict';

app
  .provider('Auth', function() {

    this.$get = ['FURL', '$firebaseAuth', '$firebase', '$firebaseObject', '$location', '$rootScope', 'toaster',
        function (FURL, $firebaseAuth, $firebase,$firebaseObject,$location,$rootScope, toaster) {
            return new AuthProvider(FURL, $firebaseAuth, $firebase,$firebaseObject,$location,$rootScope, toaster);
        }];

    // array of callbacks to execute after auth is finished
    var doAfterAuth = [];

    /**
    *
    *   adds a callback to doAfterAuth[]; can only be used
    *   in module.config() blocks
    *   Callbacks are executed after Auth is finished and passed the Auth object
    *
    */
    this.setDoAfterAuth = function (newDAA) {
        doAfterAuth.push(newDAA);
    }

    // executes all registered callbacks after auth is complete
    // this is very important for making other providers that rely on Auth (currently, only Phased) to run
    var doAllAfterAuth = function(Auth) {
        for (var i in doAfterAuth) {
            doAfterAuth[i](Auth);
        }
    }

    // AngularJS will instantiate a singleton by calling "new" on this function
    var AuthProvider = function(FURL, $firebaseAuth, $firebase,$firebaseObject,$location,$rootScope, toaster) {
        var ref = new Firebase(FURL);
        var auth = $firebaseAuth(ref);

        var Auth = {
            user: {},
            fb : auth,
            newTeam : false,
            login: function(user, success, failure) {
                if (typeof success == 'undefined')
                    var success = function() {};
                if (typeof failure == 'undefined')
                    var failure = function() {};

                auth.$authWithPassword(
                    {email: user.email, password: user.password}
                ).then(
                    function(authData) {
                        if (!('uid' in authData)) {
                            failure(authData);
                            return;
                        } else {
                            angular.copy(authData, Auth.user);
                            getProfileDetails(Auth.user.uid)
                                .then(success, authData);
                        }
                    },
                    function(err) {
                        failure(err);
                    }
                );
            },
            register : function(user) {
                user.email = user.email.toLowerCase();
                $.post('./api/registration/register', {
                    user: JSON.stringify(user)
                })
                .success(function(data) {
                    if (data.success) {
                        console.log('success', data);
                        Auth.login(user);
                    } else {
                        console.log('err', data);
                    }
                })
                .error(function(data){
                    console.log('err', data);
                });
            },
            logout: function() {
                console.log('logged out');
                auth.$unauth();
            },
            changePassword : function(user) {
                return auth.$changePassword({email: user.email, oldPassword: user.oldPass, newPassword: user.newPass});
            },
            changeEmail : function(user, uid) {
              // console.log('will change email', user, uid);
              var profile = ref.child("profile").child(uid).child('email').set(user.email);

            },
            changeName: function(user, uid){
              // console.log('will change name', user.name);
              var profile = ref.child("profile").child(uid).child('name').set(user.name);
            },
            changeTel: function(user, uid){
              console.log('will change tel', user.tel);
              if (isValidNumber(user.tel, 'CA'))
                user.tel = formatE164('CA', user.tel);
              else
                return false;

              var profile = ref.child("profile/" + uid + '/tel').set(user.tel, function(err){
                // after updating, send a welcome SMS
                ref.child('newTel').push(user.tel);
              });

              return true;
            },
            signedIn: function() {
                return !!Auth.user.provider;
            },
            createTeam : function(name,uid){
              Auth.newTeam = true;
              var teamMaker = makeTeam(name,uid);
              return teamMaker;
            },
            currentTeam : ''
        };


        /**
        *
        *   fills in Auth.user with variables from /profile/$uid
        *   then calls the doAfterAuth callbacks
        *   then calls its own callbacks (set in a pseudo-Promise)
        *
        */
        var getProfileDetails = function(uid) {
            // where pseudo-promise is kept
            getProfileDetails.then = function() {};
            getProfileDetails.args = {};
            // below is returned
            var pseudoPromise = {
                then : function(doAfter, args) {
                    if (doAfter)
                        getProfileDetails.then = doAfter;
                    if (args)
                        getProfileDetails.args = args;
                }
            }

            // get account data
            ref.child('profile/' + uid).once('value', function (snapshot) {
                var user = snapshot.val();
                if (user) {
                    Auth.user.profile = user;
                    Auth.currentTeam = user.curTeam;
                    mixpanel.identify(uid);
                    mixpanel.people.set({
                        "$email": user.email,    // only special properties need the $
                        "$last_login": new Date(),         // properties can be dates...
                        "team" : user.curTeam

                    });
                    // if user isn't currently on a team
                    if (!user.curTeam) {
                        // if the user has teams, set the first one to active
                        if ( user.teams ) {
                            Auth.currentTeam = user.teams[Object.keys(user.teams)[0]]; // first of the user's teams
                            ref.child('profile/' + uid + '/curTeam').set(Auth.currentTeam);
                        } else {
                            // if the user doesn't have teams, main.controller will prompt to add one
                            Auth.currentTeam = false;
                        }
                    }

                    doAllAfterAuth(Auth);
                    getProfileDetails.then(getProfileDetails.args);
                } else {
                    console.warn('Grave error, user ' + uid + ' does not exist');
                    $location.path('/login');
                }
            });

            // return the pseudo-promise
            return pseudoPromise;
        }


        /**
        *
        *   makes a new team, adds current user to it, makes them Owner
        *   1. if team exists, add user to it as member
        *   2. if doesn't exists,
        *       A. make it
        *       B. add user to it as owner
        *
        */
        var makeTeam = function(teamName, id) {
            // adds a member to a team
            var addMemberToTeam = function(teamID, role) {
                // 1. adds to team/$team/members with role (defaults to member)
                var role = role || 0; // 0 == member
                ref.child('team/' + teamID + '/members/' + id).set({role : role});

                // 2. adds to profile/$uid/teams
                ref.child('profile/' + id + '/teams').push(teamID);

                // 3. sets profile/$uid/curTeam
                ref.child('profile/' + id + '/curTeam').set(teamID);
            } // end addMemberToTeam()

            // if Auth knows we're making a new team
            if (Auth.newTeam) {
                // 1. check that it exists
                ref.child('team').orderByChild('name').equalTo(teamName)
                .once('value', function(snapshot) {
                    var team = snapshot.val();
                    var teamID = snapshot.key();

                    // if it doesn't exists
                    if (!team) {
                        // make it
                        var newTeamRef = ref.child('team').push({ name : teamName });
                        // add member to it
                        addMemberToTeam(newTeamRef.key(), 2); // 2 == owner
                    }
                    // if it does exist
                    else {
                        if (!id in team.members)
                            addMemberToTeam(teamID); // as member
                    }
                });
            }
        };


        /**
        *   INIT
        */

        // listen for auth state changes
        // if logged in and on /login, go to /
        // if logging out (or session timeout!), go to /login
        // else do nothing
        auth.$onAuth(function(authData) {
            var path = '';
            // if not authenticated, go to /login
            if (!authData) {
                path = '/login';
            }
            // if authenticated on the login screen, go to /
            else if ($location.path() == '/login') {
                path = '/';
            }
            // do nothing if authenticated within the app
            else {
                return;
            }

            // go places
            $rootScope.$apply(
                function() {
                    $location.path(path);
                }
            );
        });

        // get user account metadata if already logged in
        var authData = auth.$getAuth();
        if (authData) {
            angular.copy(authData, Auth.user);
            getProfileDetails(Auth.user.uid); // go to app after getting details
        }

        return Auth;
    }

  });
