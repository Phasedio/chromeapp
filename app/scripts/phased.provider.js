app
  .provider('Phased', function() {

    /**

      PhasedProvider provides a single access point for interacting with the Phased FireBase server.

      It provides
        - methods for adding, updating, or removing data from the server
        - 'live' properties reflecting the data in the database (courtesy of FBRef.on())
        - 'static' properties reflecting Phased constants (such as task priority names and IDs)

      Note on FireBase async:
        Methods can be called from controllers that request data from Auth before the
      FireBase AJAX requests (called in AuthProvider.doAfterAuth()) that gather that data are complete. To
      circumvent this, methods that need this data are registered as callbacks (via registerAsync) which
      are either fired immediately if doAfterAuth is complete (ie, PHASED_SET_UP == true) or at the end of
      this.init() if not (via doAsync).
        Because of this, all methods exposed by PhasedProvider must be registered with registerAsync.

      Class organization:

      - Class setup
        - Internal variables (defaults, flags, callback lists)
        - Provider prototype definition
        - general init -- this.init()
        - constructor -- this.$get
      - Config functions (which set flags)
      - Async interfaces (which ensure exposed functions aren't called before data they depend on)
      - Init functions (which gather team and member data and apply Firebase watchers, called in this.init())
      - Watching functions (which observe firebase data and apply to the appropriate properties on the provider)
      - Internal utilities (used by exposed functions to perform routine operations)
        - issueNotification
        - updateHistory
        - cleaning objects to go to the DB
        - other JS utils
      - Exposed functions (which all use the async interfaces and are all applied to the Provider prototype)
        - General account things
        - "Data functions" (adding statuses or tasks, modifying projects, etc)


    **/

    /**
    * Internal vars
    */
    var DEFAULTS = {
      // these all need to be strings
      projectID : '0A',
      columnID : '0A',
      cardID : '0A'
    },

      // FLAGS
      PHASED_SET_UP = false, // set to true after team is set up and other fb calls can be made
      PHASED_MEMBERS_SET_UP = false, // set to true after member data has all been loaded
      PHASED_META_SET_UP = false, // set to true after static meta values are loaded
      WATCH_PROJECTS = false, // set in setWatchProjects in config; tells init whether to do it
      WATCH_NOTIFICATIONS = false, // set in setWatchNotifications in config; whether to watch notifications
      WATCH_PRESENCE = false, // set in setWatchPresence in config; whether to update user's presence

      // ASYNC CALLBACKS
      req_callbacks = [], // filled with operations to complete when PHASED_SET_UP
      req_after_members = [], // filled with operations to complete after members are in
      req_after_meta = [], // filled with operations to complete after meta are in
      membersRetrieved = 0; // incremented with each member's profile gathered

    var _Auth, FBRef; // tacked on to PhasedProvider
    var ga = ga || function(){}; // in case ga isn't defined (as in chromeapp)
    var $rootScope = { $broadcast : function(a){} }; // set in $get, default for if PhasedProvider isn't injected into any scope. not available in .config();

    /**
    *
    * The provider itself (all hail)
    * returned by this.$get
    */
    var PhasedProvider = {
        SET_UP : false, // exposed duplicate of PHASED_SET_UP
        FBRef : FBRef, // set in setFBRef()
        user : {}, // set in this.init() to Auth.user.profile
        team : { // set in initializeTeam()
          _FBHandlers : [], // filled with callbacks to deregister in unwatchTeam()
          members : {},
          statuses : [], // stream of team's status updates
          teamLength : 0 // members counted in setUpTeamMembers
        },
        get : { // a read-only unordered list of objects which otherwise would have been nested.
          columns : {},
          cards : {},
          tasks : {}
        },
        viewType : 'notPaid',

        // META CONSTANTS
        // set up in intializeMeta()
        // TASK
        task : {
          PRIORITY : {},
          PRIORITY_ID : {},

          HISTORY_ID : {},

          STATUS : {},
          STATUS_ID : {}
        },

        // PROJECT
        project : {
          PRIORITY : {},
          PRIORITY_ID : {},

          HISTORY : {},
          HISTORY_ID : {}
        },

        // COLUMN
        column : {
          HISTORY : {},
          HISTORY_ID : {}
        },

        // CARD
        card : {
          PRIORITY : {},
          PRIORITY_ID : {},

          HISTORY : {},
          HISTORY_ID : {}
        },

        // ROLE
        ROLE : {},
        ROLE_ID : {},

        // PRESENCE
        PRESENCE : {},
        PRESENCE_ID : {},

        // NOTIF
        NOTIF_TYPE : {},
        NOTIF_TYPE_ID : {},


        // data streams
        // data updated with FBRef.on() watches
        //
        notif : {}, // notifications for current user
        assignments : { // Phased.assignments
          all : {}, // all of the team's assignments
          to_me : {}, // assigned to me (reference to objects in all)
          by_me : {}, // assigned by me (reference to objects in all)
          unassigned : {} // unassigned (reference to objects in all)
        },
        archive : {
          all : {},
          to_me : {},
          by_me : {},
          unassigned : {}
        }
      };

    /**
    *
    * configure the provider and begin requests
    * called in AuthProvider's doAfterAuth callback,
    * which must be set in a .config() block
    *
    * optionally passed a config object, which describes
    * whether team history or assignments should be monitored
    */

    this.init = function(Auth) {
      _Auth = Auth;
      PhasedProvider.user = Auth.user.profile;
      PhasedProvider.user.uid = Auth.user.uid;
      PhasedProvider.team.uid = Auth.currentTeam;

      initializeMeta(); // gathers static values set in DB

      // only do these if user is on a team for which they can see members,
      // notifications, have presence logged!
      if (Auth.currentTeam) {
        initializeTeam(); // gathers/watches team and members

        if (WATCH_NOTIFICATIONS)
          watchNotifications();
        if (WATCH_PRESENCE)
          registerAfterMeta(watchPresence);

        // if the user is new, welcome them to the world
        // and remove newUser flag
        // doesn't need to be done after team data is in, since the server
        // will do that heavy lifting
        if (Auth.user.profile.newUser) {
          FBRef.child('profile/' + PhasedProvider.user.uid + '/newUser').remove();
          registerAfterMembers(function() {
            issueNotification({
              title : [{string : 'Welcome to Phased, '}, {userID: Auth.user.uid}],
              body : [],
              type : PhasedProvider.NOTIF_TYPE_ID.USER_CREATED
            });
          });
        }
      }
    }

    /**
    *
    * constructs the provider itself
    * exposes data, methods, and a FireBase reference
    *
    */
    this.$get = ['$rootScope', function(_rootScope) {
      $rootScope = _rootScope;
      // register functions listed after this in the script...

      // add member and team
      PhasedProvider.addMember = _addMember;
      PhasedProvider.changeMemberRole = _changeMemberRole;
      PhasedProvider.addTeam = _addTeam;
      PhasedProvider.switchTeam = _switchTeam;

      // STATUS update (formerly HISTORY or TASKS)
      PhasedProvider.addStatus = _addStatus;

      // CATEGORY manipulation (per-team)
      PhasedProvider.addCategory = _addCategory;
      PhasedProvider.deleteCategory = _deleteCategory;

      // TASKS (formerly ASSIGNMENTS and also TASKS... kind of...)
      // creating and manipulating
      PhasedProvider.addTask = _addTask;
      PhasedProvider.setTaskStatus = _setTaskStatus;
      PhasedProvider.setTaskName = _setTaskName;
      PhasedProvider.setTaskDesc = _setTaskDesc;
      PhasedProvider.setTaskDeadline = _setTaskDeadline;
      PhasedProvider.setTaskAssignee = _setTaskAssignee;
      PhasedProvider.setTaskCategory = _setTaskCategory;
      PhasedProvider.setTaskPriority = _setTaskPriority;
      // activating / shuffling
      PhasedProvider.activateTask = _activateTask;
      PhasedProvider.takeTask = _takeTask;

      // NOTIFS
      PhasedProvider.markNotifAsRead = _markNotifAsRead;
      PhasedProvider.markAllNotifsAsRead = _markAllNotifsAsRead;

      return PhasedProvider;
    }];

    // must be called in config or everything breaks
    this.setFBRef = function(FURL) {
      FBRef = new Firebase(FURL);
      PhasedProvider.FBRef = FBRef;
    }

    /*
    **
    **  FLAGS
    **  must all be set in .config before this.init()
    **
    */

    // sets WATCH_PROJECTS
    // determines whether projects are monitored
    this.setWatchProjects = function(watch) {
      if (watch)
        WATCH_PROJECTS = true;
    }

    // sets WATCH_NOTIFICATIONS
    // determines whether notifications are monitored
    this.setWatchNotifications = function(watch) {
      if (watch)
        WATCH_NOTIFICATIONS = true;
    }

    // sets WATCH_PRESENCE
    // determines whether own user's presence is monitored
    this.setWatchPresence = function(watch) {
      if (watch)
        WATCH_PRESENCE = true;
    }


    /*
    **
    **  ASYNC FUNCTIONS
    **  An interface for functions that depend on remote data
    **  Exposed functions call register____, passing it a reference
    **  to the internal function that is needed. If the condition
    **  determined by the flag is met, the callback is executed
    **  immediately; if not, it is added to the list of callbacks
    **  which are fired as soon as the condition is met.
    **
    **  in general,
    **
    **  PhasedProvider.exposedMethod = _exposedMethod;
    **
    **  // after condition is met
    **  PHASED_CONDITION = true;
    **  doCondition();
    **
    **  var _exposedMethod = function(args) {
    **    registerCondition(doExposedMethod, args);
    **  }
    **  var doExposedMethod = function(args){
    **    // some stuff;
    **  }
    **
    */

    /**
    *
    * registerAsync
    * if Phased has team and member data, do the thing
    * otherwise, add it to the list of things to do
    *
    */
    var registerAsync = function(callback, args) {
      if (PHASED_SET_UP)
        callback(args);
      else
        req_callbacks.push({callback : callback, args : args });
    }

    var doAsync = function() {
      for (var i in req_callbacks) {
        req_callbacks[i].callback(req_callbacks[i].args || undefined);
      }
      PHASED_SET_UP = true;
      PhasedProvider.SET_UP = true;
    }

    /**
    *
    * registerAfterMeta
    * called after meta is in from server
    *
    */
    var registerAfterMeta = function(callback, args) {
      if (PHASED_META_SET_UP)
        callback(args);
      else
        req_after_meta.push({callback : callback, args : args });
    }

    var doAfterMeta = function() {
      for (var i in req_after_meta) {
        req_after_meta[i].callback(req_after_meta[i].args || undefined);
      }
      PHASED_META_SET_UP = true;
    }

    /**
    *
    * registerAfterMembers
    * called after member data is in from server
    */
    var registerAfterMembers = function(callback, args) {
      if (PHASED_MEMBERS_SET_UP)
        callback(args);
      else
        req_after_members.push({callback : callback, args : args });
    }

    var doAfterMembers = function() {
      for (var i in req_after_members) {
        req_after_members[i].callback(req_after_members[i].args || undefined);
      }
      PHASED_MEMBERS_SET_UP = true;
    }




    /*
    **
    **  INTIALIZING FUNCTIONS
    **
    */

    /*
    *
    * Gathers all static data, applies to PhasedProvider
    *
    */
    var initializeMeta = function() {
      FBRef.child('meta').once('value', function(snap) {
        var data = snap.val();

        // task
        PhasedProvider.task = {
          PRIORITY : data.task.PRIORITY,
          PRIORITY_ID : data.task.PRIORITY_ID,

          HISTORY_ID : data.task.HISTORY_ID, // no strings for this one

          STATUS : data.task.STATUS,
          STATUS_ID : data.task.STATUS_ID
        };

        // PROJECT
        PhasedProvider.project = {
          PRIORITY : data.project.PRIORITY,
          PRIORITY_ID : data.project.PRIORITY_ID,

          HISTORY : data.project.HISTORY,
          HISTORY_ID : data.project.HISTORY_ID
        };

        // COLUMN
        PhasedProvider.column = {
          HISTORY : data.column.HISTORY,
          HISTORY_ID : data.column.HISTORY_ID
        };

        // CARD
        PhasedProvider.card = {
          PRIORITY : data.card.PRIORITY,
          PRIORITY_ID : data.card.PRIORITY_ID,

          HISTORY : data.card.HISTORY,
          HISTORY_ID : data.card.HISTORY_ID
        };

        // ROLE
        PhasedProvider.ROLE = data.ROLE;
        PhasedProvider.ROLE_ID = data.ROLE_ID;

        // PRESENCE
        PhasedProvider.PRESENCE = data.PRESENCE;
        PhasedProvider.PRESENCE_ID = data.PRESENCE_ID;

        // NOTIF
        PhasedProvider.NOTIF_TYPE = data.NOTIF_TYPE;
        PhasedProvider.NOTIF_TYPE_ID = data.NOTIF_TYPE_ID;

        doAfterMeta();
        $rootScope.$broadcast('Phased:meta');
      });
    }

    /*
    *
    * Gathers all of the team data for the first time and sets appropriate
    * watching functions.
    *
    * Requires PhasedProvider.team.uid and PhasedProvider.user
    *
    */
    var initializeTeam = function() {
      FBRef.child('team/' + PhasedProvider.team.uid).once('value', function(snap) {
        var data = snap.val();

        PhasedProvider.team.name = data.name;
        PhasedProvider.team.members = data.members;
        PhasedProvider.team.teamLength = Object.keys(data.members).length;
        PhasedProvider.team.statuses = data.statuses || []; // need to do this here bc FB doesn't store empty vals
        PhasedProvider.team.projects = data.projects || [];
        PhasedProvider.team.project_archive = data.project_archive;
        PhasedProvider.team.categoryObj = data.category;
        PhasedProvider.team.categorySelect = objToArray(data.category); // adds key prop

        // set up references in .get[objectName] to their respective objects
        // this allows us to have an unordered collection of, eg, all tasks, to gather data
        // (this is similar to how .assignments.all used to work)
        for (var i in PhasedProvider.team.projects) {
          for (var j in PhasedProvider.team.projects[i].columns)
            PhasedProvider.get.columns[j] = PhasedProvider.team.projects[i].columns[j];
        }
        for (var i in PhasedProvider.get.columns) {
          for (var j in PhasedProvider.get.columns[i].cards)
            PhasedProvider.get.cards[j] = PhasedProvider.get.columns[i].cards[j];
        }
        for (var i in PhasedProvider.get.cards) {
          for (var j in PhasedProvider.get.cards[i].tasks)
            PhasedProvider.get.tasks[j] = PhasedProvider.get.cards[i].tasks[j];
        }

        // get profile details for team members
        for (var id in PhasedProvider.team.members) {
          initializeMember(id);
        }

        // monitor team for changes
        watchTeam();

        // get billing info
        checkPlanStatus(data.billing.stripeid, data.billing.subid);
      });
    }

    /**
    *
    * Gathers then watches a member's profile data
    *
    * 1. make one call to get initial data
    * 2. apply data to appropriate properties
    * 3. set child_changed listener on /profile/$uid
    * 3B. which applies the incoming data to the appropriate key
    *
    * Logistical things:
    * L1. stash handler so we can un-watch when needed
    * L2. broadcast Phased:member for each member
    * L3. broadcast Phased:membersComplete when all are in
    * L4. call doAfterMembers() when all are in.
    *
    */
    var initializeMember = function(id) {
      // 1. gather all data once
      FBRef.child('profile/' + id).once('value', function(snap){
        var data = snap.val();
        PhasedProvider.team.members[id] = PhasedProvider.team.members[id] || {};

        // 2. apply data
        PhasedProvider.team.members[id].name = data.name;
        PhasedProvider.team.members[id].pic = data.gravatar;
        PhasedProvider.team.members[id].gravatar = data.gravatar;
        PhasedProvider.team.members[id].email = data.email;
        PhasedProvider.team.members[id].tel = data.tel;
        PhasedProvider.team.members[id].uid = id;
        PhasedProvider.team.members[id].newUser = data.newUser;

        if (id == PhasedProvider.user.uid)
          getUsersTeams(data.teams);

        // 3. and then watch for changes
        var handler = FBRef.child('profile/' + id).on('child_changed', function(snap) {
          var data = snap.val(),
            key = snap.key(),
            currentUser = id == PhasedProvider.user.uid;

          // 3B. apply data to appropriate key
          PhasedProvider.team.members[id][key] = data;
          if (currentUser) { // if this is for the current user
            if (key == 'teams') { // need to get team names and keep IDs
              getUsersTeams(data);
            } else { // simply assign
              PhasedProvider.user[key] = data
            }
          }

          // special duplicate case
          if (key == 'gravatar') {
            PhasedProvider.team.members[id].pic = data;
            if (currentUser)
              PhasedProvider.user.pic = data;
          }

          // notify
          $rootScope.$broadcast('Phased:memberChanged');
        });

        // L1. stash handler to stop watching event if needed
        var deregister_obj = {
            address : 'profile/' + id,
            eventType : 'child_changed',
            callback : handler
          };

        ('_FBHandlers' in PhasedProvider.team.members[id] &&
          typeof PhasedProvider.team.members[id]._FBHandlers == 'object') ?
          PhasedProvider.team.members[id]._FBHandlers.push(deregister_obj) :
          PhasedProvider.team.members[id]._FBHandlers = [deregister_obj];

        // L2. broadcast events to tell the rest of the app the team is set up
        $rootScope.$broadcast('Phased:member');

        // L3. and L4. (once all members are in)
        membersRetrieved++;
        if (membersRetrieved == PhasedProvider.team.teamLength && !PHASED_MEMBERS_SET_UP) {
          doAfterMembers();
          $rootScope.$broadcast('Phased:membersComplete');
          doAsync();
          $rootScope.$broadcast('Phased:setup');
        }
      });

      // get user's team names. have to go to DB bc team names are only stored at /team/$teamID/name
      var getUsersTeams = function(teamList) {
        for (var i in teamList) {
          (function(teamIndex){
          var teamID = teamList[teamIndex];
          FBRef.child('team/' + teamID + '/name').once('value', function(snap){
            if (typeof PhasedProvider.user.teams != 'object')
              PhasedProvider.user.teams = {};

            PhasedProvider.user.teams[teamIndex] = {
              id : teamID,
              name : snap.val()
            }
          });
        })(i)
        }
      }
    }

    /**
    *
    * Checks current plan status
    *
    * Checks ./api/pays/find for the current team's viewType
    * defaults to 'notPaid'
    *
    **/
    var checkPlanStatus = function(stripeid,subid) {
      if (typeof stripeid == 'string' && stripeid.length > 0) {
        PhasedProvider.viewType = 'active';
        // $.post('./api/pays/find', {customer: stripeid,sub:subid})
        //   .success(function(data){
        //     if (data.err) {
        //       console.log(data.err);
        //       // handle error
        //     }
        //     console.log(data.status);
        //     if (data.status == "active" ){
        //       //Show thing for active
        //       PhasedProvider.viewType = 'active';
        //
        //     }else if (data.status == "trialing"){
        //       //Show thing for problem with account
        //       PhasedProvider.viewType = 'trialing';
        //
        //
        //     } else if (data.status == 'past_due' || data.status == 'unpaid'){
        //       //Show thing for problem with account
        //       PhasedProvider.viewType = 'problem';
        //
        //
        //     } else if (data.status == 'canceled'){
        //       //Show thing for problem with canceled
        //       PhasedProvider.viewType = 'canceled';
        //
        //     }
        //     $rootScope.$broadcast('Phased:PaymentInfo');
        //   })
        //   .error(function(data){
        //     console.log(data);
        //   });
      } else {
        PhasedProvider.viewType = 'notPaid';
      }
    }


    /*
    **
    **  WATCHING FUNCTIONS
    **
    */

    /*
    *
    * watchTeam
    * sets up other firebase data event handlers for team data
    * including statuses, projects/cards/statuses, team membership
    *
    * stores for de-registering when switching teams
    *
    */
    var watchTeam = function() {
      var teamKey = 'team/' + PhasedProvider.team.uid,
        cb = ''; // set to callback for each FBRef.on()

      // name
      cb = FBRef.child(teamKey + '/name').on('value', function(snap){
        PhasedProvider.team.name = snap.val();
      });

      PhasedProvider.team._FBHandlers.push({
        address : teamKey + '/name',
        eventType : 'value',
        callback : cb
      });


      // statuses
      // adds the status if it's not already there
      cb = FBRef.child(teamKey + '/statuses').on('child_added', function(snap){
        var key = snap.key();
        if (!(key in PhasedProvider.team.statuses))
          PhasedProvider.team.statuses[key] = snap.val();

        $rootScope.$broadcast('Phased:newStatus');
      });

      PhasedProvider.team._FBHandlers.push({
        address : teamKey + '/statuses',
        eventType : 'child_added',
        callback : cb
      });


      // category (doesn't need memory references)
      cb = FBRef.child(teamKey + '/category').on('value', function(snap) {
        var data = snap.val();
        PhasedProvider.team.categoryObj = data;
        PhasedProvider.team.categorySelect = objToArray(data); // adds key prop
      });

      PhasedProvider.team._FBHandlers.push({
        address : teamKey + '/category',
        eventType : 'value',
        callback : cb
      });


      // billing
      cb = FBRef.child(teamKey + '/billing').on('value', function(snap){
        var billing = snap.val();
        checkPlanStatus(billing.stripeid, billing.subid);
      });

      PhasedProvider.team._FBHandlers.push({
        address : teamKey + '/billing',
        eventType : 'value',
        callback : cb
      });


      // members
      cb = FBRef.child(teamKey + '/members').on('child_changed', function(snap) {
        var memberID = snap.key(),
          data = snap.val();

        // if new member, initialize
        if (!(memberID in PhasedProvider.team.members)) {
          initializeMember(memberID);
        }

        // update all keys as needed
        for (var key in data) {
          PhasedProvider.team.members[memberID][key] = data[key];
        }
        $rootScope.$broadcast('Phased:memberChanged');
      });

      PhasedProvider.team._FBHandlers.push({
        address : teamKey + '/members',
        eventType : 'child_changed',
        callback : cb
      });

      // projects
      if (WATCH_PROJECTS)
        watchProjects();
    }

    /*
    *
    * unwatchTeam
    * prepares us to switch to another team by un-setting the active
    * firebase event handlers
    *
    */
    var unwatchTeam = function() {
      var count = 0;
      // unwatch all team watchers
      for (var i in PhasedProvider.team._FBHandlers) {
        var handler = PhasedProvider.team._FBHandlers[i];
        FBRef.child(handler.address).off(handler.eventType, handler.callback);
        count++;
      }
      PhasedProvider.team._FBHandlers = [];
      console.log(count + ' team event handlers removed.');

      // unwatch all team members
      count = 0;
      for (var i in PhasedProvider.team.members) {
        var handlers = PhasedProvider.team.members[i]._FBHandlers;
        for (var j in handlers) {
          FBRef.child(handlers[j].address).off(handlers[j].eventType, handlers[j].callback);
          count++;
        }
        PhasedProvider.team.members[i]._FBHandlers = [];
      }
      console.log(count + ' member event handlers removed.');

      // unlink get
      PhasedProvider.get = {
        tasks : {},
        columns : {},
        cards : {}
      }
    }

    /**
    *
    * gathers notifications for current user
    * adds to PhasedProvider.notif.stream
    *
    * tells server to clean up old, read notifs for the user
    *
    */
    var watchNotifications = function() {

      // returns the interpreted string version of the title or body obj
      var stringify = function(obj) {
        // if obj is already a string, spit it out
        if ((typeof obj).toLowerCase() == 'string')
          return obj;

        var out = '';
        for (var j in obj) {
          if (obj[j].string) {
            out += obj[j].string;
          } else if (obj[j].userID) {
            if (obj[j].userID == PhasedProvider.user.uid) // use "you" for current user
              out += 'you';
            else
              out += PhasedProvider.team.members[obj[j].userID].name;
          }
        }

        return out;
      }

      registerAfterMembers(function doWatchNotifications(){
        // clean notifications once
        // $.post('./api/notification/clean', {
        //   user: PhasedProvider.user.uid,
        //   team : PhasedProvider.team.uid
        // })
        //   .success(function(data) {
        //     if (data.success) {
        //       // console.log('clean notifications success', data);
        //     } else {
        //       console.log('clean notifications error', data);
        //     }
        //   })
        //   .error(function(data){
        //     console.log('err', data.error());
        //   });

        // set up watcher
        var notifAddress = 'notif/' + PhasedProvider.team.uid + '/' + PhasedProvider.user.uid;
        var cb = FBRef.child(notifAddress)
          .on('value', function(data) {
            var notifications = data.val();

            // format titles and bodies
            for (var id in notifications) {
              notifications[id].title = stringify(notifications[id].title);
              notifications[id].body = stringify(notifications[id].body);
              notifications[id].key = id;
            }
            // update stream
            PhasedProvider.notif.stream = notifications;

            // issue notification event
            $rootScope.$broadcast('Phased:notification');
          });

        // stash for deregistering
        PhasedProvider.team._FBHandlers.push({
          address : notifAddress,
          eventType : 'value',
          callback : cb
        });
      });
    }

    /**
    *
    * Monitors current user's presence
    *
    * NB: must be called after meta are in
    *
    * 1. sets their presence to PhasedProvider.PRESENCE_ID.ONLINE when connected
    *
    * 2. sets their presence attr to PhasedProvider.PRESENCE_ID.OFFLINE
    * and updates lastOnline on FB disconnect
    *
    */
    var watchPresence = function() {
      if (!('uid' in PhasedProvider.team)) {
        console.log('Cannot watch presence for user not on a team');
        return;
      }

      FBRef.child('.info/connected').on('value', function(snap){
        // we're connected, handle this stuff
        if (snap.val() == true) {
          // 1. immediately set us to "present"
          FBRef.child('team/' + PhasedProvider.team.uid + '/members/' + PhasedProvider.user.uid).update({
            presence : PhasedProvider.PRESENCE_ID.ONLINE
          });

          // 2. register disconnect handler
          FBRef.child('team/' + PhasedProvider.team.uid + '/members/' + PhasedProvider.user.uid).onDisconnect().update({
            lastOnline : Firebase.ServerValue.TIMESTAMP,
            presence : PhasedProvider.PRESENCE_ID.OFFLINE
          });
        }
      });

      // go "offline" when deauthenticated
      FBRef.onAuth(function(authData){
        if (!authData) {
          FBRef.child('team/' + PhasedProvider.team.uid + '/members/' + PhasedProvider.user.uid).update({
            lastOnline : Firebase.ServerValue.TIMESTAMP,
            presence : PhasedProvider.PRESENCE_ID.OFFLINE
          });
        }
      });
    }


    /**
    *
    * Watches a team's projects, keeping them in sync with FireBase
    *
    * A slightly recursive function. It watches all projects (via
    * child_added) with watchOneProject, which calls watchAllColumns,
    * which calls watchOneColumn on each of that project's columns,
    * which calls wachAllCards and so on.
    *
    * in short, we need to add a watch at each level:
    * /projects
    *   -- /$projID
    *       |- /columns
    *         -- /$colID
    *           |- /cards
    * etc.
    *
    * Should only be called from watchTeam if WATCH_PROJECTS is set.
    * Replaces watchAssignments().
    * Stashes all even listeners in the team's _FBHandlers for
    * deregistration when switching teams.
    *
    */
    var watchProjects = function() {
      var projAddr = 'team/' + PhasedProvider.team.uid + '/projects',
        projectsRef = FBRef.child(projAddr),
        cb;

      // sets up watchers for a single project
      var watchOneProject = function(projID) {
        var projRef = projectsRef.child(projID);

        // then watch own children
        cb = projRef.on('child_changed', function(snap) {
          var key = snap.key();
          if (key != 'columns') // don't directly update the columns key
            PhasedProvider.team.projects[projID][key] = snap.val();
        });
        PhasedProvider.team._FBHandlers.push({
          address : projAddr + '/' + projID,
          eventType : 'child_changed',
          callback : cb
        });

        cb = projRef.on('child_added', function(snap){
          var key = snap.key()
          PhasedProvider.team.projects[projID][key] = snap.val();
          // watch columns after they're added
          if (key == 'columns')
            watchAllColumns(projID, projRef);
        });
        PhasedProvider.team._FBHandlers.push({
          address : projAddr + '/' + projID,
          eventType : 'child_added',
          callback : cb
        });

        cb = projRef.on('child_removed', function(snap){
          delete PhasedProvider.team.projects[projID][snap.key()];
        });
        PhasedProvider.team._FBHandlers.push({
          address : projAddr + '/' + projID,
          eventType : 'child_removed',
          callback : cb
        });
      }

      // observe when cards are added to or removed from a col
      var watchAllColumns = function(projID, projRef) {
        cb = projRef.child('columns').on('child_added', function(snap){
          var colID = snap.key();
          PhasedProvider.team.projects[projID].columns[colID] = snap.val();
          PhasedProvider.get.columns[colID] = PhasedProvider.team.projects[projID].columns[colID];
          watchOneColumn(colID, projID);
          $rootScope.$broadcast('Phased:columnAdded');
        });
        PhasedProvider.team._FBHandlers.push({
          address : projRef.child('columns').key(),
          eventType : 'child_added',
          callback : cb
        });

        cb = projRef.child('columns').on('child_removed', function(snap){
          delete PhasedProvider.get.columns[snap.key()];
          delete PhasedProvider.team.projects[projID].columns[snap.key()];
          $rootScope.$broadcast('Phased:columnDeleted');
        });

        PhasedProvider.team._FBHandlers.push({
          address : projRef.child('columns').key(),
          eventType : 'child_removed',
          callback : cb
        });
      }
      var watchOneColumn = function(colID, projID) {
        var thisColAddr = projID + '/columns/' + colID;
        var colRef = projectsRef.child(thisColAddr);

        // then watch own children
        cb = colRef.on('child_changed', function(snap) {
          var key = snap.key();
          if (key != 'cards') // don't directly update the cards key
            PhasedProvider.team.projects[projID].columns[colID][key] = snap.val();
        });
        PhasedProvider.team._FBHandlers.push({
          address : projAddr + '/' + thisColAddr,
          eventType : 'child_changed',
          callback : cb
        });

        cb = colRef.on('child_added', function(snap){
          var key = snap.key()
          PhasedProvider.team.projects[projID].columns[colID][key] = snap.val();
          // watch cards after they're added
          if (key == 'cards')
            watchAllCards(colID, projID, colRef);
        });
        PhasedProvider.team._FBHandlers.push({
          address : projAddr + '/' + thisColAddr,
          eventType : 'child_added',
          callback : cb
        });

        cb = colRef.on('child_removed', function(snap){
          delete PhasedProvider.team.projects[projID].columns[colID][snap.key()];
        });
        PhasedProvider.team._FBHandlers.push({
          address : projAddr + '/' + thisColAddr,
          eventType : 'child_removed',
          callback : cb
        });
      }

      // observe when cards are added to or removed from a col
      var watchAllCards = function(colID, projID, colRef) {
        var cb = '';
        cb = colRef.child('cards').on('child_added', function(snap){
          var cardID = snap.key();
          PhasedProvider.team.projects[projID].columns[colID].cards[cardID] = snap.val();
          PhasedProvider.get.cards[cardID] = PhasedProvider.team.projects[projID].columns[colID].cards[cardID];
          watchOneCard(cardID, colID, projID);
          $rootScope.$broadcast('Phased:cardAdded');
        });
        PhasedProvider.team._FBHandlers.push({
          address : colRef.child('cards').key(),
          eventType : 'child_added',
          callback : cb
        });

        cb = colRef.child('cards').on('child_removed', function(snap){
          delete PhasedProvider.get.cards[cardID];
          delete PhasedProvider.team.projects[projID].columns[colID].cards[snap.key()];
          $rootScope.$broadcast('Phased:cardDeleted');
        });

        PhasedProvider.team._FBHandlers.push({
          address : colRef.child('cards').key(),
          eventType : 'child_removed',
          callback : cb
        });
      }
      var watchOneCard = function(cardID, colID, projID) {
        var thisCardAddr = projID + '/columns/' + colID + '/cards/' + cardID;
        var cardRef = projectsRef.child(thisCardAddr);

        // then watch own children
        cb = cardRef.on('child_changed', function(snap) {
          var key = snap.key();
          if (key != 'tasks') // don't directly update the tasks key
            PhasedProvider.team.projects[projID].columns[colID].cards[cardID][key] = snap.val();
        });
        PhasedProvider.team._FBHandlers.push({
          address : projAddr + '/' + thisCardAddr,
          eventType : 'child_changed',
          callback : cb
        });

        cb = cardRef.on('child_added', function(snap){
          var key = snap.key()
          PhasedProvider.team.projects[projID].columns[colID].cards[cardID][key] = snap.val();
          // watch tasks when they are added
          if (key == 'tasks') {
            watchAllTasks(cardID, colID, projID, cardRef);
          }
        });
        PhasedProvider.team._FBHandlers.push({
          address : projAddr + '/' + thisCardAddr,
          eventType : 'child_added',
          callback : cb
        });

        cb = cardRef.on('child_removed', function(snap){
          delete PhasedProvider.team.projects[projID].columns[colID].cards[cardID][snap.key()];
        });
        PhasedProvider.team._FBHandlers.push({
          address : projAddr + '/' + thisCardAddr,
          eventType : 'child_removed',
          callback : cb
        });
      }

      // observe when tasks are added to or removed from a card
      var watchAllTasks = function(cardID, colID, projID, cardRef) {
        var cb = '';
        cb = cardRef.child('tasks').on('child_added', function(snap){
          var taskID = snap.key();
          PhasedProvider.team.projects[projID].columns[colID].cards[cardID].tasks[taskID] = snap.val();
          PhasedProvider.get.tasks[taskID] = PhasedProvider.team.projects[projID].columns[colID].cards[cardID].tasks[taskID];
          watchOneTask(taskID, cardID, colID, projID);
          $rootScope.$broadcast('Phased:taskAdded');
        });
        PhasedProvider.team._FBHandlers.push({
          address : cardRef.child('tasks').key(),
          eventType : 'child_added',
          callback : cb
        });

        cb = cardRef.child('tasks').on('child_removed', function(snap){
          delete PhasedProvider.get.tasks[snap.key()];
          delete PhasedProvider.team.projects[projID].columns[colID].cards[cardID].tasks[snap.key()];
          $rootScope.$broadcast('Phased:taskDeleted');
        });

        PhasedProvider.team._FBHandlers.push({
          address : cardRef.child('tasks').key(),
          eventType : 'child_removed',
          callback : cb
        });
      }
      var watchOneTask = function(taskID, cardID, colID, projID) {
        var thisTaskAddr = projID + '/columns/' + colID + '/cards/' + cardID + '/tasks/' + taskID;
        var taskRef = projectsRef.child(thisTaskAddr);
        var cb = '';

        cb = taskRef.on('child_changed', function(snap) {
          PhasedProvider.team.projects[projID].columns[colID].cards[cardID].tasks[taskID][snap.key()] = snap.val();
        });
        PhasedProvider.team._FBHandlers.push({
          address : projAddr + '/' + thisTaskAddr,
          eventType : 'child_changed',
          callback : cb
        });

        cb = taskRef.on('child_added', function(snap){
          PhasedProvider.team.projects[projID].columns[colID].cards[cardID].tasks[taskID][snap.key()] = snap.val();
        });
        PhasedProvider.team._FBHandlers.push({
          address : projAddr + '/' + thisTaskAddr,
          eventType : 'child_added',
          callback : cb
        });

        cb = taskRef.on('child_removed', function(snap){
          delete PhasedProvider.team.projects[projID].columns[colID].cards[cardID].tasks[taskID][snap.key()];
        });
        PhasedProvider.team._FBHandlers.push({
          address : projAddr + '/' + thisTaskAddr,
          eventType : 'child_removed',
          callback : cb
        });
      }

      // watch projects
      var cb = '';
      cb = projectsRef.on('child_added', function(snap){
        // add project
        PhasedProvider.team.projects[snap.key()] = snap.val();
        // watch project
        watchOneProject(snap.key());
        $rootScope.$broadcast('Phased:projectAdded');
      });

      PhasedProvider.team._FBHandlers.push({
        address : projAddr,
        eventType : 'child_added',
        callback : cb
      });

      cb = projectsRef.on('child_removed', function(snap){
        // remove project
        delete PhasedProvider.team.projects[snap.key()];
        $rootScope.$broadcast('Phased:projectDeleted');
      });

      PhasedProvider.team._FBHandlers.push({
        address : projAddr,
        eventType : 'child_removed',
        callback : cb
      });
    }



    /*
    **
    **  INTERNAL UTILITIES
    **
    **  utilities for
    **  - issuing notifications
    **  - updating an object's history
    **  - cleaning data to go to database
    **  - JS utilities (popFromList and objToArray)
    */

    /**
    *
    * issues a notification to every member on the team
    * (server does heavy lifting)
    *
    * title and body are arrays of objects which are either
    * { string : 'a simple string' }
    * or { userID : 'aUserID' }
    * which will be interpreted when loaded by client (see watchNotifications)
    *
    * example
    * {
    *   title : [{string: 'A simple notification'}]
    *   body : [{string: 'this is an example notification'}]
    *   type : PhasedProvider.NOTIF_TYPE_ID.STATUS // or whatever is applicable
    * }
    *
    */
    var issueNotification = function(notification) {
      // $.post('./api/notification/issue', {
      //   user: _Auth.user.uid,
      //   team : _Auth.currentTeam,
      //   notification : JSON.stringify(notification)
      // })
      //   .success(function(data) {
      //       if (data.success) {
      //         // console.log('IssueNotif success', data);
      //       } else {
      //         console.log('IssueNotif error', data);
      //       }
      //   })
      //   .error(function(data){
      //     console.log('err', data.error());
      //   });
    }

    /**
    *
    * Formats and issues a notification for a task history update
    *
    * @arg data is just the object in the task's history stream
    *
    */
    var issueTaskHistoryNotification = function(data) {
      var streamItem = {};
      switch (data.type) {
        /**
        *   TASK CREATED
        */
        case PhasedProvider.task.HISTORY_ID.CREATED :
          streamItem = {
            body : [{string : data.snapshot.name}],
            cat : data.snapshot.cat,
            type : PhasedProvider.NOTIF_TYPE_ID.ASSIGNMENT_CREATED
          };

          // make title :
          // 1 assigned to someone else
          // 2 self-assigned
          // 3 unassigned

          if (data.snapshot.assigned_by != data.snapshot.assigned_to &&
            (data.snapshot.assigned_to && !data.snapshot.unassigned)) { // 1
              streamItem.title = [
                { string : 'New task assigned to ' },
                { userID : data.snapshot.assigned_to },
                { string : ' by ' },
                { userID : data.snapshot.assigned_by }
              ];
          } else if (data.snapshot.assigned_by == data.snapshot.assigned_to) { // 2
            streamItem.title = [
              { userID : data.snapshot.assigned_by },
              { string : ' self-assigned a new task' }
            ];
          } else if (data.snapshot.unassigned) { // 3.
            streamItem.title = [
              { userID : data.snapshot.assigned_by},
              { string : ' created a new unassigned task'}
            ]
          } else {
            console.warn('Issuing task history notification failed -- bad title');
            return;
          }
          break;
        /**
        *   TASK ARCHIVED
        *   nb: an archived task snapshot could appear in an active task's history
        */
        case PhasedProvider.task.HISTORY_ID.ARCHIVED :
          streamItem = {
            title : [{ string : 'Task archived' }],
            body : [{ string : data.snapshot.name }],
            cat : data.snapshot.cat,
            type : PhasedProvider.NOTIF_TYPE_ID.ASSIGNMENT_ARCHIVED
          }
          break;
        /**
        *   TASK UNARCHIVED
        */
        case PhasedProvider.task.HISTORY_ID.UNARCHIVED :
          streamItem = {
            title : [{ string : 'Task unarchived' }],
            body : [{ string : data.snapshot.name }],
            cat : data.snapshot.cat,
            type : PhasedProvider.NOTIF_TYPE_ID.ASSIGNMENT_UNARCHIVED
          }
          break;
        /**
        *   TASK NAME CHANGED
        */
        case PhasedProvider.task.HISTORY_ID.NAME :
          streamItem = {
            title : [{ string : 'Task name changed' }],
            body : [{ string : 'to "' + data.snapshot.name + '"' }],
            cat : data.snapshot.cat,
            type : PhasedProvider.NOTIF_TYPE_ID.ASSIGNMENT_UPDATED
          }
          break;
        /**
        *   TASK DESC CHANGED
        */
        case PhasedProvider.task.HISTORY_ID.DESCRIPTION :
          streamItem = {
            title : [{ string : 'Task description changed' }],
            body : [{ string : data.snapshot.name }],
            cat : data.snapshot.cat,
            type : PhasedProvider.NOTIF_TYPE_ID.ASSIGNMENT_UPDATED
          }
          break;

        /**
        *   TASK ASSIGNEE CHANGED
        */
        case PhasedProvider.task.HISTORY_ID.ASSIGNEE :
          streamItem = {
            title : [
              { string : 'Task assigned to '},
              { userID : data.snapshot.assigned_to }
            ],
            body : [{ string : data.snapshot.name }],
            cat : data.snapshot.cat,
            type : PhasedProvider.NOTIF_TYPE_ID.ASSIGNMENT_ASSIGNED
          }
          break;
        /**
        *   TASK DEADLINE CHANGED
        */
        case PhasedProvider.task.HISTORY_ID.DEADLINE :
          streamItem = {
            title : [{ string : 'Task deadline changed' }],
            body : [{ string : data.snapshot.name }],
            cat : data.snapshot.cat,
            type : PhasedProvider.NOTIF_TYPE_ID.ASSIGNMENT_UPDATED
          }
          break;
        /**
        *   TASK PRIORITY CHANGED
        */
        case PhasedProvider.task.HISTORY_ID.CATEGORY :
          streamItem = {
            title : [{ string : 'Task category changed' }],
            body : [{ string : data.snapshot.name }],
            cat : data.snapshot.cat,
            type : PhasedProvider.NOTIF_TYPE_ID.ASSIGNMENT_UPDATED
          }
          break;

        /**
        *   TASK PRIORITY CHANGED
        */
        case PhasedProvider.task.HISTORY_ID.PRIORITY :
          streamItem = {
            title : [{ string : 'Task priority changed' }],
            body : [{ string : data.snapshot.name }],
            cat : data.snapshot.cat,
            type : PhasedProvider.NOTIF_TYPE_ID.ASSIGNMENT_UPDATED
          }
          break;

        /**
        *   TASK STATUS CHANGED
        */
        case PhasedProvider.task.HISTORY_ID.STATUS :
          streamItem = {
            title : [{ string : 'Task status changed' }],
            body : [{ string : data.snapshot.name }],
            cat : data.snapshot.cat,
            type : PhasedProvider.NOTIF_TYPE_ID.ASSIGNMENT_STATUS
          }
          switch (data.snapshot.status) {
            case PhasedProvider.task.STATUS_ID.IN_PROGRESS :
              streamItem.title = [{ string : 'Task in progress' }];
              break;
            case PhasedProvider.task.STATUS_ID.COMPLETE :
              streamItem.title = [{ string : 'Task completed' }];
              break;
            case PhasedProvider.task.STATUS_ID.ASSIGNED :
              streamItem.title = [{ string : 'Task assigned' }];
              break;
            default:
              break;
          }
          break;
        /**
        *   TASK UPDATED (generic)
        */
        default :
          streamItem = {
            title : [{ string : 'Task updated' }],
            body : [{ string : data.snapshot.name }],
            cat : data.snapshot.cat,
            type : PhasedProvider.NOTIF_TYPE_ID.ASSIGNMENT_UPDATED
          }
          break;
      }

      issueNotification(streamItem);
    }

    /**
    *
    * updates the task's history with the following object type:
    * {
    *  time : [current timestamp],
    *  type : [type of operation, reference to code in PhasedProvider.TASK_HISTORY_CHANGES],
    *  taskSnapshot : [copy of the task at this time, minus the history object]
    * }
    *
    * also issues a notification to the team.
    *
    * needs args.FBRef and args.task, but can make both of these with args.taskID.
    * fails if one of FBRef or task are missing AND taskID is also missing.
    *
    * args = {
    *   task : task, // optional. task object to make snapshot of.
    *   taskID : taskID, // optional. task's ID
    *   taskRef : taskRef // optional. reference to task in Firebase
    *   type : type // REQUIRED. type of history update.
    *  }
    *
    * 0. decide whether to fail
    * 1. gather information:
    *   1A. get taskRef if not supplied
    *   1B. get task if not supplied
    *   1C. create the snapshot
    * 2. update db
    * 3. issue notification
    *
    */

    var updateTaskHist = function(args) {
      var ids;

      // 0. decide if we have enough info to continue
      if (
          (
            (
              !('taskRef' in args) || !('task' in args) // either of taskRef or task are missing
            ) &&
            !('taskID' in args) // and taskID is also missing
          ) || (
            !('type' in args) // or type is missing
          )
        ) {
        console.error('Phased.updateTaskHist failed: not enough information');
        return false;
      }

      // 1A. get taskRef if not present
      var taskRef = args.taskRef
      if (!(args.taskRef)) {
        ids = find(args.taskID, 'task');
        taskRef = FBRef.child(ids.FBAddr);
      }

      // 1B. get task if not present
      var task = args.task;
      if (!(args.task)) {
        if (!ids)
          ids = find(args.taskID, 'task'); // only do this when needed

        task = PhasedProvider.team.projects[ids.projID].columns[ids.colID].cards[ids.cardID].tasks[ids.taskID];
      }

      // 1C. create the snapshot by removing the history obj
      task = angular.copy(task);
      delete task.history;

      var data = {
        time : Firebase.ServerValue.TIMESTAMP,
        type : args.type, // history type
        snapshot : task
      }

      // 2. update history in DB
      taskRef.child('history').push(data);

      // 3. format and issue notification
      issueTaskHistoryNotification(data);
    }

    /**
    *
    * finds a column, card, or task in the project tree
    * returns an object with the project, column, card, task IDs
    * also generates an address to that item in firebase
    *
    * NB: somewhat expensive operation; try to avoid if you already have
    * the IDs or a FBRef somewhere else
    *
    */
    var find = function(needleID, type) {
      var teamAddr = 'team/' + PhasedProvider.team.uid;
      var out;

      // traverses levels of the project tree
      var walker = function(haystack, callback) {
        for (var i in haystack) {
          callback(haystack[i], i);
        }
      }

      // find column
      if (type.toLowerCase().indexOf('col') >= 0) {
        walker(PhasedProvider.team.projects, function(project, projID) {
          walker(project.columns, function(column, colID) {
            if (colID == needleID)
              out = {
                projID : projID,
                colID : colID,
                FBAddr : teamAddr + '/projects/' + projID + '/columns/' + colID
              };
          });
        });
      }
      // find card
      else if (type.toLowerCase() == 'card') {
        walker(PhasedProvider.team.projects, function(project, projID) {
          walker(project.columns, function(column, colID) {
            walker(column.cards, function(card, cardID) {
              if (cardID == needleID)
                out = {
                  projID : projID,
                  colID : colID,
                  cardID : cardID,
                  FBAddr : teamAddr + '/projects/' + projID + '/columns/' + colID + '/cards/' + cardID
                };
            });
          });
        });
      }
      // find task
      else if (type.toLowerCase() == 'task' || type.toLowerCase() == 'assignment') {
        walker(PhasedProvider.team.projects, function(project, projID) {
          walker(project.columns, function(column, colID) {
            walker(column.cards, function(card, cardID) {
              walker(card.tasks, function(task, taskID) {
                if (taskID == needleID)
                  out = {
                    projID : projID,
                    colID : colID,
                    cardID : cardID,
                    taskID : taskID,
                    FBAddr : teamAddr + '/projects/' + projID + '/columns/' + colID + '/cards/' + cardID + '/tasks/' + taskID
                  };
              });
            });
          });
        });
      }

      return out;
    }

    /**
    *
    * cleanObjectShallow()
    *
    * performs a single-level cleaning of an incoming associative array
    * ensuring required nodes are present and allowing optional nodes
    * returns a pristine copy of dirtyObj (ie, a new object) or false if
    * required nodes are missing
    *
    * expects config to have two properties, 'required' & 'optional',
    * which themselves have type-organized lists of node names, ie
    *
    *  config = {
    *    required : {
    *      strings : [],
    *      numbers : [],
    *      booleans : []
    *    },
    *    optional : {
    *      strings : [],
    *      numbers : [],
    *      booleans : []
    *    }
    *  }
    *
    */
    var cleanObjectShallow = function(dirtyObj, config) {
      var cleanObj = {},
        required = config.required,
        optional = config.optional;

      // REQUIRED:
      if ('required' in config) {
        // required strings
        for (var i in required.strings) {
          if (typeof dirtyObj[required.strings[i]] === 'string' &&
              dirtyObj[required.strings[i]] != '') {
            cleanObj[required.strings[i]] = dirtyObj[required.strings[i]];
          } else {
            console.log('required property "' + required.strings[i] + '" not found; aborting');
            return false;
          }
        }

        // required numbers
        for (var i in required.numbers) {
          if (typeof dirtyObj[required.numbers[i]] === 'number' &&
              !isNaN(dirtyObj[required.numbers[i]])) {
            cleanObj[required.numbers[i]] = dirtyObj[required.numbers[i]];
          } else {
            console.log('required property "' + required.numbers[i] + '" not found or is NaN; aborting');
            return false;
          }
        }

        // booleans
        for (var i in required.booleans) {
          if (typeof dirtyObj[required.booleans[i]] === 'boolean') {
            cleanObj[required.booleans[i]] = dirtyObj[required.booleans[i]];
          } else {
            console.log('required property "' + required.booleans[i] + '" not found; aborting');
            return false;
          }
        }
      }

      // OPTIONAL
      if ('optional' in config) {
        // optional strings
        for (var i in optional.strings) {
          if (typeof dirtyObj[optional.strings[i]] === 'string' &&
              dirtyObj[optional.strings[i]] != '') {
            cleanObj[optional.strings[i]] = dirtyObj[optional.strings[i]];
          }
        }

        // optional numbers
        for (var i in optional.numbers) {
          if (typeof dirtyObj[optional.numbers[i]] === 'number'
            && !isNaN(dirtyObj[optional.numbers[i]])) {
            cleanObj[optional.numbers[i]] = dirtyObj[optional.numbers[i]];
          }
        }

        // booleans
        for (var i in optional.booleans) {
          if (typeof dirtyObj[optional.booleans[i]] === 'boolean') {
            cleanObj[optional.booleans[i]] = dirtyObj[optional.booleans[i]];
          }
        }
      }

      return cleanObj;
    }

    // cleans a project ~~ STUB
    var cleanProject = function(newProject) {

    }

    // cleans a column ~~ STUB
    var cleanColumn = function(newColumn) {

    }

    // cleans a card ~~ STUB
    var cleanCard = function(newCard) {

    }

    // cleans an assignment
    var cleanAssignment = function(newAssignment, includeHist) {
      // properties to check
      var config = {
          required : {
          strings : ['name', 'created_by', 'assigned_by']
        },
        optional : {
          strings : ['cat', 'taskPrefix', 'photo', 'assigned_to'],
          numbers : ['deadline', 'priority', 'status'],
          booleans : ['unassigned']
        }
      };

      var assignment = cleanObjectShallow(newAssignment, config);

      // check for history
      if (includeHist) {
        assignment.history = angular.copy(newAssignment.history); // copies and removes $$hashkeys
      }

      return assignment;
    }

    // cleans a status
    var cleanStatus = function(newStatus) {
      // properties to check
      var config = {
          required : {
          strings : ['name', 'user']
        },
        optional : {
          strings : ['cat', 'taskPrefix']
        }
      };

      return cleanObjectShallow(newStatus, config);
    }

    // remove an item from an array
    // returns the new array
    var popFromList = function(item, list) {
      if (!('indexOf' in list)) {
        list = objToArray(list); // change list to array if it's an object
      }
      var i = list.indexOf(item);
      while (i > -1) {
        delete list[i];
        i = list.indexOf(item);
      }
      return list;
    }

    // convert object into array
    // returns the new array
    // useful for arrays with missing keys
    // eg, [0 = '', 1 = '', 3 = ''];
    var objToArray = function(obj) {
      var newArray = [];
      for (var i in obj) {
        if (typeof obj[i] == 'object' || typeof obj[i] == 'function')
          obj[i].key = i;
        newArray.push(obj[i]);
      }
      return newArray;
    }




    /**
    **
    ** EXPOSED FUNCTIONS
    ** all registered as callbacks with registerAsync()
    **
    **/

    /**

      General account and team things

    **/

    /**
    *
    * adds a member
    * Brian's better add member function
    * 1. checks if member is in /profile
    * 2A. if so, registers current team on member's profile and adds to our team
    * 2B. if not, checks whether they are a profile in waiting
    * 2B1. if they are, add team to newMember's profile
    * 2B2. if not, add to /profile-in-waiting and /profile-in-waiting2
    */

    var _addMember = function(newMember) {
      var args = {
        newMember : newMember
      }

      registerAsync(doAddMember, args);
    }

    var doAddMember = function(args) {
      ga('send', 'event', 'Team', 'Member invited');
      $.post('./api/registration/invite', {
        invitedEmail: args.newMember.email,
        inviterEmail : PhasedProvider.user.email,
        inviterName : PhasedProvider.user.name,
        team : PhasedProvider.team.uid
      })
      .success(function(data) {
        if (data.success) {
          console.log('success', data);
          if (data.added) {
            issueNotification({
              title : [{userID : data.userID}, {string : ' has joined your team'}],
              body : [],
              type : PhasedProvider.NOTIF_TYPE_ID.USER_JOINED
            });
          } else if (data.invited) {
            console.log('User was invited to join Phased');
          }
        } else {
          console.log('err', data);
        }
      })
      .error(function(data){
        console.log('err', data);
      });
    }

    /**
    *
    * adds a team
    * function mostly copied from chromeapp ctrl-createTeam.js
    * 1. offload work to server
    * 2A. if making team was successful, switch to that team
    * 2B. if it already exists, run fail callback
    */

    var _addTeam = function(teamName,email, success, failure, addToExistingTeam) {
      var args = {
        teamName : teamName,
        email :email,
        success : success,
        failure : failure,
        addToExistingTeam : typeof addToExistingTeam === 'boolean' ? addToExistingTeam : false // only use value if set
      }
      registerAfterMeta(doAddTeam, args); // can be called before Phased team but needs Meta
    }

    var doAddTeam = function(args) {
      // 1.
      $.post('./api/registration/registerTeam', {
        userID : PhasedProvider.user.uid,
        teamName : args.teamName
      })
      .success(function(data){
        if (data.success) {
          ga('send', 'event', 'Team', 'team added');
          // 2A. switch to that team
          doSwitchTeam({
            teamID : data.teamID,
            callback : args.success
          });
        } else {
          // fail
          console.log(data);
          if (typeof args.failure == 'function')
            args.failure(args.teamName);
        }
      })
      .error(function(error){
        // 2B. fail!
        console.log(error);
        if (typeof args.failure == 'function')
          args.failure(args.teamName);
      })
    }


    /**
    *
    * switches current user's active team
    * optionally calls a callback
    */

    var _switchTeam = function(teamID, callback) {
      var args = {
        teamID : teamID,
        callback : callback
      }
      registerAsync(doSwitchTeam, args);
    }

    var doSwitchTeam = function(args) {
      // stash team
      var oldTeam = typeof PhasedProvider.team.uid == 'string' ? PhasedProvider.team.uid + '' : false;

      // remove old event handlers
      unwatchTeam();

      // reload team data
      PhasedProvider.team.uid = args.teamID;
      _Auth.currentTeam = args.teamID;
      initializeTeam();

      if (WATCH_NOTIFICATIONS)
        watchNotifications();

      // update user curTeam
      FBRef.child('profile/' + _Auth.user.uid + '/curTeam').set(args.teamID, function(err) {
        // switch back on error
        if (err && !('recursing' in args)) {
          doSwitchTeam({teamID : oldTeam, recursing : true});
          return;
        }
        // execute callback if it exists
        if (typeof args.callback == 'function')
          args.callback();
        ga('send', 'event', 'Team', 'Team switched');

        $rootScope.$broadcast('Phased:switchedTeam');
      });

      // update presence information for both teams
      if (WATCH_PRESENCE) {
        if (oldTeam) {
          // cancel old handler
          FBRef.child('team/' + oldTeam + '/members/' + PhasedProvider.user.uid).onDisconnect().cancel();
          // go offline for old team
          FBRef.child('team/' + oldTeam + '/members/' + _Auth.user.uid).update({
            presence : PhasedProvider.PRESENCE_ID.OFFLINE,
            lastOnline : Firebase.ServerValue.TIMESTAMP
          });
        }
        // go online and set new handler for current team
        watchPresence();
      }
    }

    /**
    *
    * changes any member's role
    *
    * FB additionally validates security and data type, but we do it here
    * also for speed. Reverts ID and calls failure function on failure.
    *
    * 1. check own role
    * 2. validate new data type
    * 3. validate member is on team
    * 4. update DB
    *
    */

    var _changeMemberRole = function(memberID, newRole, oldRole, failure) {
      var args = {
        memberID : memberID,
        newRole : newRole,
        oldRole : oldRole,
        failure : failure
      }

      registerAsync(doChangeMemberRole, args);
    }

    var doChangeMemberRole = function(args) {
      // convenience for checking args.failure before calling
      var fail = function(code, message) {
        if (typeof args.oldRole == 'number') // revert if possible
          PhasedProvider.team.members[args.memberID].role = args.oldRole;
        if (typeof args.failure == 'function') // call failure callback if possible
          args.failure(code, message);
        return;
      }

      // 1. check own auth
      var myRole = PhasedProvider.team.members[PhasedProvider.user.uid].role;
      // changes in the model are immediate (jeez, thanks angular) so if we're changing our own role,
      // we need to use the old value
      if (args.memberID == PhasedProvider.user.uid)
        myRole = args.oldRole;

      if (myRole != PhasedProvider.ROLE_ID.ADMIN && myRole != PhasedProvider.ROLE_ID.OWNER) {
        fail('PERMISSION_DENIED', 'You are not authorized to change another user\'s role on this team.');
        return;
      }

      // 2. validate new auth
      if (!(args.newRole in PhasedProvider.ROLE)) {
        fail('INVALID_ROLE', 'Invalid role data');
        return;
      }

      // 3. ensure member is on team
      if (!(args.memberID in PhasedProvider.team.members)) {
        fail('INVALID_USER', 'Cannot change role for member not on team');
        return;
      }

      // 4. update DB (which will update UI);
      FBRef.child('team/' + PhasedProvider.team.uid + '/members/' + args.memberID + '/role').set(args.newRole, function(err){
        if (err) {
          var strings = err.message.split(': ');
          fail(strings[0], 'Server says: "' + strings[1] + '"');
        } else {
          ga('send', 'event', 'Member', 'Role changed');
          issueNotification({
            title : [{string : 'Role for '}, {userID : args.memberID}, {string: ' has changed'}],
            body : [{string : 'to ' + PhasedProvider.ROLE[args.newRole]}],
            type : PhasedProvider.NOTIF_TYPE_ID.USER_ROLE_CHANGED
          });
        }
      });
    }

    /**
    *
    * marks a single notification as read
    * without deleting it from the server
    *
    */
    var _markNotifAsRead = function(key, index) {
      var args = {
        key : key,
        index : index
      }
      registerAsync(doMarkNotifAsRead, args);
    }

    var doMarkNotifAsRead = function(args) {
      var key = args.key;
      var index = args.index;

      // find index if not there
      if (typeof index == 'undefined') {
        for (var i in PhasedProvider.notif.stream) {
          if (PhasedProvider.notif.stream[i].key == key) {
            index = i;
            break;
          }
        }
      }

      PhasedProvider.notif.stream[index].read = true;
      FBRef.child('notif/' + PhasedProvider.team.uid + '/' + _Auth.user.uid + '/' + key).update({
        read : true
      });
      ga('send', 'event', 'Notification', 'Read');
    }

    /**
    *
    * marks all notifications as read
    * without deleting them from the server
    *
    */
    var _markAllNotifsAsRead = function() {
      registerAsync(doMarkAllNotifsAsRead);
    }

    var doMarkAllNotifsAsRead = function() {
      for (var i in PhasedProvider.notif.stream) {
        doMarkNotifAsRead({
          key : PhasedProvider.notif.stream[i].key,
          index : i
        });
      }
    }

    /**
    *
    * add category to current team
    *
    * NB: This will update categories of the same name or key
    *
    * 1. check all incoming category properties
    * 2. check if category with that name or key already exists
    * 3A. if so, update it
    * 3B. if not, create it
    *
    */
    var _addCategory = function(category) {
      registerAsync(doAddCategory, category);
    }

    var doAddCategory = function(args) {
      var category = {
        name :  args.name,
        color : args.color
      };

      // 1.
      // check colour
      var regex = /^\#([a-zA-Z0-9]{3}|[a-zA-Z0-9]{6})$/;
      if (!(category.color && regex.test(category.color))) {
        console.log('bad category colour');
        return;
      }

      // check name exists, has length, is a word
      regex = /\w+/;
      if (!(category.name && regex.test(category.name))) {
        console.log('bad category name');
        return;
      }

      category.created = new Date().getTime();
      category.user = _Auth.user.uid;

      console.log('creating category', category);

      // 2. Check if category exists
      var catExists = false;
      var key = '';
      for (key in PhasedProvider.team.categoryObj) {
        var nameExists = PhasedProvider.team.categoryObj[key].name.toLowerCase() == category.name.toLowerCase();
        var keyExists = key == args.key;
        if (nameExists || keyExists) {
          catExists = true;
          break;
        }
      }

      // 3A. category exists; update
      if (catExists) {
        console.log('cat exists at ' + key);
        FBRef.child('team/' + PhasedProvider.team.uid + '/category/' + key).set(category);
        ga('send', 'event', 'Category', 'Changed');
        issueNotification({
          title : [{string : '"' + category.name + '" category has been modified'}],
          body : [],
          cat : key,
          type : PhasedProvider.NOTIF_TYPE_ID.CATEGORY_CHANGED
        });
      }

      // 3B.
      else {
        console.log('cat doesn\'t exist');
        var newCatRef = FBRef.child('team/' + PhasedProvider.team.uid + '/category').push(category);
        ga('send', 'event', 'Category', 'Created');
        issueNotification({
          title : [{string : '"' + category.name + '" category has been created'}],
          body : [],
          cat : newCatRef.key(),
          type : PhasedProvider.NOTIF_TYPE_ID.CATEGORY_ADDED
        });
      }
    }

    /**
    *
    * deletes category from current team
    *
    * NB: will attempt to delete a cat even if not there
    *
    * 1. ensure key is a string
    * 2. delete category
    */
    var _deleteCategory = function(key) {
      registerAsync(doDeleteCategory, key);
    }

    var doDeleteCategory = function(key) {
      // 1.
      if ((typeof key).toLowerCase() != 'string') {
        console.log('bad key');
        return;
      }

      var catName = PhasedProvider.team.categoryObj[key].name; // stash cat name
      console.log('deleting cat ' + catName);

      // 2.
      FBRef.child('team/' + PhasedProvider.team.uid + '/category/' + key).set(null);
      ga('send', 'event', 'Category', 'Deleted');

      // 3.
      issueNotification({
        title : [{string : '"' + catName + '" category has been deleted'}],
        body : [],
        type : PhasedProvider.NOTIF_TYPE_ID.CATEGORY_DELETED
      });
    }


    /**

      Data functions
      Things like adding statuses, assignments, projects, etc.

    **/

    /**
    *
    * sends a status update to the server, pushes to team
    * these are the normal status updates used in /feed
    *
    * cleans newStatus first. fails if bad data.
    *
    */

    var _addStatus = function(newStatus) {
      registerAsync(doAddStatus, newStatus);
    }

    var doAddStatus = function(newStatus) {
      ga('send', 'event', 'Update', 'Submitted');
      ga('send', 'event', 'Status', 'Status added');

      // clean
      newStatus.user = _Auth.user.uid;
      newStatus = cleanStatus(newStatus);
      if (!newStatus) return;

      newStatus.time = new Date().getTime();

      // publish to stream
      var teamRef = FBRef.child('team/' + PhasedProvider.team.uid);
      teamRef.child('members/' + PhasedProvider.user.uid + '/currentStatus').set(newStatus);
      var newStatusRef = teamRef.child('statuses').push(newStatus, function(err){
        // after DB is updated, issue a notification to all users
        if (!err) {
          issueNotification({
            title : [{ userID : _Auth.user.uid }],
            body : [{ string : newStatus.name }],
            cat : newStatus.cat,
            type : PhasedProvider.NOTIF_TYPE_ID.STATUS
          });
        }
      });
    }


    /**
    *
    * adds a task
    * 1. check & format input
    * 2. push to db (using default project / card if none specified)
    * 3. update history to created
    *
    */
    var _addTask = function(newTask, projectID, columnID, cardID) {
      var args = {
        newTask : newTask,
        projectID : projectID,
        columnID : columnID,
        cardID : cardID
      }
      registerAsync(doAddTask, args);
    }

    var doAddTask = function(args) {
      ga('send', 'event', 'Task', 'task added');

      var newTask = args.newTask,
        projectID = args.projectID || DEFAULTS.projectID,
        columnID = args.columnID || DEFAULTS.columnID,
        cardID = args.cardID || DEFAULTS.cardID;

      // 1. clean newTask
      newTask.assigned_by = _Auth.user.uid; // this changes if the task is re-assigned
      newTask.created_by = _Auth.user.uid; // this never changes
      newTask = cleanAssignment(newTask);
      if (!newTask) return; // makeTask failed

      newTask.time = new Date().getTime();

      // 2. push to db
      var newTaskRef = FBRef.child('team/' + PhasedProvider.team.uid + '/projects/' + projectID + '/columns/' + columnID + '/cards/' + cardID + '/tasks')
        .push(newTask);

      // 3. update history
      updateTaskHist({taskRef : newTaskRef, type : PhasedProvider.task.HISTORY_ID.CREATED, task : newTask }); // update new task's history
    }

    /**
    *
    * a user starts working on a task
    *
    * 1. take the task if it's not already assigned to you
    * 2. set the task status to In Progress
    * 3. add it as a status update
    *
    */
    var _activateTask = function (taskID, task) {
      var args = {
        task : task,
        taskID : taskID
      }
      registerAsync(doActivateTask, args);
    }

    var doActivateTask = function(args) {
      var task = angular.copy( args.task ),
        taskID = args.taskID;

      // update time to now and place to here (feature pending)
      task.time = new Date().getTime();

      // take the task if it's not already ours
      if (task.assigned_to != PhasedProvider.user.uid)
        _takeTask(taskID);

      // update original assignment status to In Progress
      _setTaskStatus(taskID, PhasedProvider.task.STATUS_ID.IN_PROGRESS);

      // publish to stream
      _addStatus(task);

      ga('send', 'event', 'Update', 'submitted');
      ga('send', 'event', 'Task', 'activated');
    }

    /**
    *
    * sets an assignment's status
    * fails if newStatus isn't valid
    */
    var _setTaskStatus = function(taskID, newStatus) {
      var args = {
        taskID : taskID,
        newStatus : newStatus
      }
      registerAsync(doSetTaskStatus, args);
    }

    var doSetTaskStatus = function(args) {
      var taskID = args.taskID,
        newStatus = args.newStatus;
      if (!(newStatus in PhasedProvider.task.STATUS)) { // not a valid ID, might be a valid string
        var i = PhasedProvider.task.STATUS.indexOf(newStatus); // get index of possible string
        if (i !== -1) { // found it
          console.log(newStatus + ' is a valid status name');
          newStatus = i; // set newStatus to be status ID, not name
        } else { // didn't find it
          console.log('err: ' + newStatus + ' is not a valid status name or ID');
          return;
        }
      }
      ga('send', 'event', 'Task', 'task status update: ' + PhasedProvider.task.STATUS[newStatus]);

      // push to database
      var update = {status : newStatus};
      // add completeTime to task if it's been completed
      // (we could probably also just check against the history snapshot and time)
      if (newStatus == PhasedProvider.task.STATUS_ID.COMPLETE)
        update.completeTime = new Date().getTime();

      var taskRef = FBRef.child(find(taskID, 'task').FBAddr);
      taskRef.update(update);
      updateTaskHist({
        taskRef: taskRef,
        taskID : taskID,
        type: PhasedProvider.task.HISTORY_ID.STATUS
      });
    }

    /**
    *
    * edit task assignee
    *
    * sets assigned_to, assigned_by (to self), and status to ASSIGNED
    */
    var _setTaskAssignee = function(taskID, newAssignee) {
      var args = {
        taskID : taskID,
        newAssignee : newAssignee
      }
      registerAsync(doSetTaskAssignee, args);
    }

    var doSetTaskAssignee = function(args) {
      FBRef.child(find(args.taskID, 'task').FBAddr)
        .update({
          assigned_to : args.newAssignee,
          assigned_by : PhasedProvider.user.uid,
          status : PhasedProvider.task.STATUS_ID.ASSIGNED,
          unassigned : null
        }, function(err) {
          if (!err) {
            ga('send', 'event', 'Task', 'Assigned');
            updateTaskHist({
              taskID : args.taskID,
              type : PhasedProvider.task.HISTORY_ID.ASSIGNEE
            });
          }
        });
    }

    /**
    *
    * shorthand for self-assigning a task
    *
    */
    var _takeTask = function(taskID) {
      _setTaskAssignee(taskID, PhasedProvider.user.uid);
    }


    /**
    *
    * edit task name
    * (simple FB interaction)
    *
    */
    var _setTaskName = function(taskID, newName) {
      var args = {
        taskID : taskID,
        newName : newName || ''
      }
      registerAsync(doSetTaskName, args);
    }

    var doSetTaskName = function(args) {
      FBRef.child(find(args.taskID, 'task').FBAddr)
        .update({ name : args.newName }, function(err){
        if (!err) {
          ga('send', 'event', 'Task', 'Name changed');
          updateTaskHist({
            taskID : args.taskID,
            type: PhasedProvider.task.HISTORY_ID.NAME
          });
        }
      });
    }

    /**
    *
    * edit task description
    * (simple FB interaction)
    *
    */
    var _setTaskDesc = function(taskID, newDesc) {
      var args = {
        taskID : taskID,
        newDesc : newDesc || ''
      }
      registerAsync(doSetTaskDesc, args);
    }

    var doSetTaskDesc = function(args) {
      FBRef.child(find(args.taskID, 'task').FBAddr)
        .update({'description' : args.newDesc}, function(err){
        if (!err) {
          ga('send', 'event', 'Task', 'Description changed');
          updateTaskHist({
            taskID : args.taskID,
            type : PhasedProvider.task.HISTORY_ID.DESCRIPTION
          });
        }
      });
    }

    /**
    *
    * edit task deadline
    * (simple FB interaction)
    *
    */
    var _setTaskDeadline = function(taskID, newDeadline) {
      var args = {
        taskID : taskID,
        newDeadline : newDeadline || ''
      }
      registerAsync(doSetTaskDeadline, args);
    }

    var doSetTaskDeadline = function(args) {
      // if newDate is set, get timestamp; else null
      var newDeadline = args.newDeadline ? new Date(args.newDeadline).getTime() : '';
      FBRef.child(find(args.taskID, 'task').FBAddr)
        .update({'deadline' : newDeadline }, function(err){
        if (!err) {
          ga('send', 'event', 'Task', 'Deadline changed');
          updateTaskHist({
            taskID : args.taskID,
            type : PhasedProvider.task.HISTORY_ID.DEADLINE
          });
        }
      });
    }

    /**
    *
    * edit task category
    * (simple FB interaction)
    *
    */
    var _setTaskCategory = function(taskID, newCategory) {
      var args = {
        taskID : taskID,
        newCategory : newCategory || ''
      }
      registerAsync(doSetTaskCategory, args);
    }

    var doSetTaskCategory = function(args) {
      FBRef.child(find(args.taskID, 'task').FBAddr)
        .update({'cat' : args.newCategory }, function(err){
        if (!err) {
          ga('send', 'event', 'Task', 'Category changed');
          updateTaskHist({
            taskID : args.taskID,
            type : PhasedProvider.task.HISTORY_ID.CATEGORY
          });
        }
      });
    }

    /**
    *
    * edit task priority
    * (simple FB interaction)
    *
    */
    var _setTaskPriority = function(taskID, newPriority) {
      var args = {
        taskID : taskID,
        newPriority : newPriority || ''
      }
      registerAsync(doSetTaskPriority, args);
    }

    var doSetTaskPriority = function(args) {
      FBRef.child(find(args.taskID, 'task').FBAddr)
        .update({'priority' : args.newPriority }, function(err){
        if (!err) {
          ga('send', 'event', 'Task', 'Priority changed');
          updateTaskHist({
            taskID : args.taskID,
            type : PhasedProvider.task.HISTORY_ID.PRIORITY
          });
        }
      });
    }


  })
  .config(['PhasedProvider', 'FURL', 'AuthProvider', function(PhasedProvider, FURL, AuthProvider) {
    PhasedProvider.setFBRef(FURL);
    PhasedProvider.setWatchProjects(true);
    PhasedProvider.setWatchNotifications(true);
    PhasedProvider.setWatchPresence(true);

    // configure phasedProvider as a callback to AuthProvider
    AuthProvider.setDoAfterAuth(PhasedProvider.init);
  }]);
