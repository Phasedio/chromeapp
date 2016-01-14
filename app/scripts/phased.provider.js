app.provider('Phased', function() {

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

        Currently team history is watched and synched with firebase but team assignments must explicitly
      be watched (using PhasedProvider.watchAssignments() in some controller)

    **/

    /**
    * Internal vars
    */
    var PHASED_SET_UP = false, // set to true after team is set up and other fb calls can be made
      WATCH_HISTORY = false, // set in setWatchHistory in config; tells init whether to do it
      WATCH_ASSIGNMENTS = false, // set in setWatchAssignments in config; tells init whether to do it
      req_callbacks = [], // filled with operations to complete when PHASED_SET_UP
      getHistoryFor = '', // set to a member id if a member's history should be attached to their team.member reference (eg, profile page)
      assignmentIDs = {
        to_me : [],
        by_me : [],
        unassigned : []
      },
      archiveIDs = {
        to_me : [],
        by_me : [],
        unassigned : []
      };
    var ga = ga || function(){}; // in case ga isn't defined (as in chromeapp)

    var _Auth, FBRef; // tacked on to PhasedProvider

    var $rootScope = { $broadcast : function(a){} }; // set in $get, default for if PhasedProvider isn't injected into any scope. not available in .config();

    /**
    *
    * The provider itself (all hail)
    * returned by this.$get
    */
    var PhasedProvider = {
        user : {},
        team : {
          members : {},
          lastUpdated : [],
          history : [],
          teamLength : 0 // members counted in setUpTeamMembers
        },
        viewType : 'notPaid',
        billing : {},
        TASK_PRIORITIES : {},
        TASK_PRIORITY_ID : {
          HIGH : 0,
          MEDIUM : 1,
          LOW : 2
        },
        TASK_STATUSES : {},
        TASK_STATUS_ID : {
          IN_PROGRESS : 0,
          COMPLETE : 1,
          ASSIGNED : 2
        },
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
        },
        FBRef : FBRef // set in setFBRef
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
      PhasedProvider.user = Auth.user;
      PhasedProvider.team.name = Auth.currentTeam;
      checkPlanStatus();
      setUpTeamMembers();
      getCategories();
      getTaskPriorities();
      getTaskStatuses();
      if (WATCH_ASSIGNMENTS)
        watchAssignments();
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
      // PhasedProvider.watchAssignments = _watchAssignments;
      // PhasedProvider.watchTaskStream = _watchTaskStream;
      PhasedProvider.getArchiveFor = _getArchiveFor;
      PhasedProvider.moveToFromArchive = _moveToFromArchive;
      PhasedProvider.activateTask = _activateTask;
      PhasedProvider.takeTask = _takeTask;
      PhasedProvider.addAssignment = _addAssignment;
      PhasedProvider.addTask = _addTask;
      PhasedProvider.setAssignmentStatus = _setAssignmentStatus;
      PhasedProvider.addMember = _addMember;
      PhasedProvider.addTeam = _addTeam;
      PhasedProvider.switchTeam = _switchTeam;
      // PhasedProvider.watchMemberStream = _watchMemberStream;
      PhasedProvider.watchMemberAssignments = _watchMemberAssignments;

      return PhasedProvider;
    }];

    // must be called in config or everything breaks
    this.setFBRef = function(FURL) {
      FBRef = new Firebase(FURL);
      PhasedProvider.FBRef = FBRef;
    }

    // sets WATCH_HISTORY flag so provider knows to
    // set up history observers in init.
    // must be called in .config block before init.
    this.setWatchHistory = function(watch) {
      if (watch)
        WATCH_HISTORY = true;
    }

    // sets WATCH_ASSIGNMENTS flag so provider knows to
    // set up assignment observers in init.
    // must be called in .config block before init.
    this.setWatchAssignments = function(watch) {
      if (watch)
        WATCH_ASSIGNMENTS = true;
    }

    /**
    *
    * registerAsync
    * if Phased is already set to go, do the thing
    * otherwise, add it to the list of things to do
    *
    */
    var registerAsync = function(callback, args) {
      if (PHASED_SET_UP)
        callback(args);
      else
        req_callbacks.push({callback : callback, args : args });
    }

    /**
    *
    * doAsync
    * executes all registered callbacks
    *
    */
    var doAsync = function() {
      for (var i in req_callbacks) {
        req_callbacks[i].callback(req_callbacks[i].args || undefined);
      }
      PHASED_SET_UP = true;
    }



    /**
    **
    **  METADATA GATHERING FUNCTIONS
    **  In which app constants are gathered from server
    **  as well as information about the current user and team
    **
    **/

    // 1. static data

    // gathers task Priorities, adds to _taskPriorities
    var getTaskPriorities = function() {
      FBRef.child('taskPriorities').once('value', function(tP /*taskPriorities*/ ) {
        tP = tP.val();
        if (typeof tP !== 'undefined' && tP != null){
          // assign keys to obj, set to _taskPriorities
          for (var i in tP) {
            tP[i]['key'] = i;
            PhasedProvider.TASK_PRIORITIES[i] = tP[i];
          }

        } else {
          // no status priorities exist, add defaults
          var obj = [
            { name : 'High' },
            { name : 'Medium' },
            { name : 'Low' }
          ];

          // save to db
          FBRef.child('taskPriorities').set(obj);
          // get data from db to ensure synchronicity
          FBRef.child('taskPriorities').once('value', function(tP /*taskPriorities*/ ) {
            tP = tP.val();
            // assign keys to obj and set to PhasedProvider.TASK_PRIORITIES
            for (var i in tP) {
              tP[i]['key'] = i;
              PhasedProvider.TASK_PRIORITIES[i] = tP[i];
            }
          });
        }
      });
    }

    // gathers task Statuses, adds to PhasedProvider.TASK_STATUSES
    var getTaskStatuses = function() {
      FBRef.child('taskStatuses').once('value', function(tS /*taskStatuses*/ ) {
        tS = tS.val();
        if (typeof tS !== 'undefined' && tS != null){
          // assign keys to obj, set obj to $scope
          for (var i in tS) {
            tS[i]['key'] = i;
            PhasedProvider.TASK_STATUSES[i] = tS[i];
          }
        } else {
          // no status types exist, add defaults
          var obj = [
            { name : 'In Progress' },
            { name : 'Complete' },
            { name : 'Assigned' }
          ];

           // save to db
          FBRef.child('taskStatuses').set(obj);
          // get data from db to ensure synchronicity
          FBRef.child('taskStatuses').once('value', function(tS /*taskStatuses*/ ) {
            tS = tS.val();
            // assign keys to obj and set to PhasedProvider.TASK_STATUSES
            for (var i in tS) {
              tS[i]['key'] = i;
              PhasedProvider.TASK_STATUSES[i] = tS[i];
            }
          });
        }
      });
    }


    // 2. dynamic data (logged in user & team)

    /**
    *
    * gather team data
    * 1. watches the team's tasks
    * 1.b  when a new task is posted, it refreshes the team membership
    * 2. gets today's tasks for each member,
    *    and adds them to the team's history
    */
    var setUpTeamMembers = function() {

      var taskAddress = 'team/' + PhasedProvider.team.name + '/task';
      // stash address to remove FB event handlers when switching teams
      setUpTeamMembers.address = taskAddress;

      // get members
      FBRef.child(taskAddress).on('value', function(users) {
        users = users.val();

        // ensure own ID is in user list
        // in marginal case where own user hasn't submitted a status to teamname/tasks
        if (!(users) || !(_Auth.user.uid in users)) {
          users = [];
          users[_Auth.user.uid] = {};
        }

        PhasedProvider.team.history = []; // clear history before populating

        // both populated by users below
        setUpTeamMembers.membersToGetHistFor = [];
        var membersToGet = [];

        for (var id in users) {
          // needs to be in function otherwise for loop screws up id in callback
          (function(id, users) {
            // add empty object to team.members so other fns can populate before these callbacks
            PhasedProvider.team.members[id] = {uid : id};
            membersToGet.push(id); // add synchronously
            setUpTeamMembers.membersToGetHistFor.push(id);

            FBRef.child('profile/' + id).once('value', function(data) {
              data = data.val();
              if (!data) return;

              var style = false;
              if (users[id].photo){
                style = "background:url("+users[id].photo+") no-repeat center center fixed; -webkit-background-size: cover;-moz-background-size: cover; -o-background-size: cover; background-size: cover";
              }

              PhasedProvider.team.members[id].name = data.name;
              PhasedProvider.team.members[id].pic = data.gravatar;
              PhasedProvider.team.members[id].gravatar = data.gravatar;
              PhasedProvider.team.members[id].task = users[id].name;
              PhasedProvider.team.members[id].time = users[id].time;
              PhasedProvider.team.members[id].weather = users[id].weather;
              PhasedProvider.team.members[id].city = users[id].city;
              PhasedProvider.team.members[id].email = data.email;
              PhasedProvider.team.members[id].tel = data.tel;
              PhasedProvider.team.members[id].uid = id;
              PhasedProvider.team.members[id].photo = style;
              PhasedProvider.team.members[id].newUser = data.newUser;

              // set teams to array of { name : 'My Team' }
              // leaves a bit of room for another async call to gather more team data
              // (eg, member count as was used in team switcher in chromeapp)
              PhasedProvider.team.members[id].teams = [];
              for (var i in data.teams) {
                PhasedProvider.team.members[id].teams.push({
                  name : data.teams[i]
                });
              }

              // PhasedProvider.team.members[id] = user;
              // update teamLength
              PhasedProvider.team.teamLength = Object.keys(PhasedProvider.team.members).length;

              // 2. team and user histories synched
              if (WATCH_HISTORY) {
                PhasedProvider.team.lastUpdated.push(PhasedProvider.team.members[id]);
                getMemberHistory(id);
              }

              // tell scope new data is in
              $rootScope.$broadcast('Phased:member');

              // rm this user from membersToGet
              membersToGet.splice(membersToGet.indexOf(id), 1);
              // if this is the last user in that list, emit Phased:membersComplete
              if (membersToGet.length == 0)
                $rootScope.$broadcast('Phased:membersComplete');

              // tell scope current user profile is in
              if (id == _Auth.user.uid) {
                PhasedProvider.user.profile = PhasedProvider.team.members[id];
                $rootScope.$broadcast('Phased:currentUserProfile');
              }
            });
          })(id, users);
        }

        // tell scope new data is in
        $rootScope.$broadcast('Phased:team');

        // first time only: emit Phased:setup and do registered async calls
        if (!PHASED_SET_UP) {
          $rootScope.$broadcast('Phased:setup');
          doAsync();
        }
      });
    }

    /**
    *
    * gets history for single team member
    * adds to team history and lastUpdated if WATCH_TASK_STREAM
    * adds to team.members[id] if getHistoryFor == id
    *
    */
    var getMemberHistory = function(id) {
      var endTime = new Date().getTime() - 31556926000;
      // get /team/[teamname]/all/[memberID], ordered by time, once
      // push to local team.history
      FBRef.child('team/' + PhasedProvider.team.name + '/all/' + id).orderByChild('time').startAt(endTime).once('value',function(data) {
        data = data.val();

        PhasedProvider.team.members[id].history = []; // clear history before populating
        if (data) {
          var keys = Object.keys(data);

          for (var i = 0; i < keys.length; i++){
            // add this item only if it's not already in the stream
            var addToHistory = true;
            for (var j in PhasedProvider.team.history) {
              // check time and user (can't use obj equiv bc angular adds properties)
              if (PhasedProvider.team.history[j].time == data[keys[i]].time &&
                PhasedProvider.team.history[j].user == data[keys[i]].user) {
                addToHistory = false;
              }
            }
            if (addToHistory)
              PhasedProvider.team.history.push(data[keys[i]]);

            PhasedProvider.team.members[id].history.push(data[keys[i]]); // always populate user histories
          }
        }
        // tell scope new data is in
        $rootScope.$broadcast('Phased:history');

        // rm this user from setUpTeamMembers.membersToGetHistFor
        setUpTeamMembers.membersToGetHistFor.splice(setUpTeamMembers.membersToGetHistFor.indexOf(id), 1);
        // if this is the last user in that list, emit Phased:historyComplete
        if (setUpTeamMembers.membersToGetHistFor.length == 0)
          $rootScope.$broadcast('Phased:historyComplete');
      });
    }

    // gathers team categories data and adds to PhasedProvider.team
    var getCategories = function() {
      var team = _Auth.currentTeam;
      FBRef.child('team').child(team).child('category').once('value', function(cat) {
        cat = cat.val();
        PhasedProvider.team.categorySelect = [];

        if(typeof cat !== 'undefined' && cat != null){
          var keys = Object.keys(cat);
          PhasedProvider.team.categoryObj = cat;
            for (var i = 0; i < keys.length; i++){
              var obj = {
                name : cat[keys[i]].name,
                color : cat[keys[i]].color,
                key : keys[i]
              }
              PhasedProvider.team.categorySelect.push(obj);
            }
        } else {
          //they have no categories so add them
          var obj = [
            {
              name : 'Communication',
              color : '#ffcc00'
            },
            {
              name : 'Planning',
              color : '#5ac8fb'
            }
          ];
          FBRef.child('team/' + team + '/category').set(obj);
          FBRef.child('team/' + team + '/category').once('value', function(cat) {
            cat = cat.val();
            var keys = Object.keys(cat);
            PhasedProvider.team.categoryObj = cat;
              for(var i = 0; i < keys.length; i++){
                var obj = {
                  name : cat[keys[i]].name,
                  color : cat[keys[i]].color,
                  key : keys[i]
                }
                PhasedProvider.team.categorySelect.push(obj);
              }
          });
        }
      });
    }

    // checks current plan status
    // retrofitted from main.controller.js to avoid using $http
    // may need changing but polls backend ok.
    /*
      NB: broken in chromeapp -- do we need to implement this?
      TODO // BUG // ATTENTION
    */
    var checkPlanStatus = function() {
      FBRef.child('team').child(_Auth.currentTeam).once('value', function(data){
        var team = data.val();

        if (team.billing){
          PhasedProvider.billingInfo = team.billing;

          // $.post('./api/pays/find', {customer: team.billing.stripeid})
          //   .success(function(data){
          //     if (data.err) {
          //       console.log(data.err);
          //       // handle error
          //     }
          //     if (data.status == "active"){
          //       //Show thing for active
          //       PhasedProvider.viewType = 'active';
          //
          //     } else if (data.status == 'past_due' || data.status == 'unpaid'){
          //       //Show thing for problem with account
          //       PhasedProvider.viewType = 'problem';
          //     } else if (data.status == 'canceled'){
          //       //Show thing for problem with canceled
          //       PhasedProvider.viewType = 'notPaid';
          //     }
          //   })
          //   .error(function(data){
          //     console.log(data);
          //   });
        } else {
          PhasedProvider.viewType = 'notPaid';
        }
      });
    }

    /**
    **
    ** EXPOSED FUNCTIONS
    ** all registered as callbacks with registerAsync(),
    **
    **/

    /**
    *
    * sets up watchers for current users task assignments (to and by
    * and also unassigned tasks), filling Phased.assignments (as PhasedProvider.assignments)
    * called in init() (could be exposed to controller)
    *
    *   - own assignments (to self or to others) assignments/to/(me)
    *   - assignments to me by others assignments/by/(me)
    *   - unassigned tasks assignments/un
    */

    var watchAssignments = function() {
      // callbacks

      /**
      *
      * updates PhasedProvider.assignments.all
      *
      * instead of replacing the whole object, compares assignments and props, then updates
      * allowing for persistent references throughout the app
      *
      */
      var updateAllAssignments = function(data) {
        data = data.val();

        updateContainerAll('assignments', data);

        // sync all containers
        for (var i in assignmentIDs) {
          syncAssignments(i);
        }
      } // updateAllAssignments()


      /**
      *
      * de-indexes and stores the data (list of task IDs),
      * then calls syncAssignments
      *
      */

      var updateAssignmentGroup = function(data, groupName) {
        assignmentIDs[groupName] = objToArray(data);
        syncAssignments(groupName);
      }

      /**
      *
      * syncs assignments (in PhasedProvider.assignments.all) listed in the UIDContainer to the assignmentContainer
      * used to maintain a running list of references in the container, eg, PhasedProvider.assignments.by_me, that point to
      * the right assignment objects in PhasedProvider.assignments.all
      *
      */
      var syncAssignments = function(assignmentContainerName) {
        var UIDContainer = assignmentIDs[assignmentContainerName];

        for (var i in UIDContainer) {
          var assignmentID = UIDContainer[i];
          if (assignmentID in PhasedProvider.assignments.all)
            PhasedProvider.assignments[assignmentContainerName][assignmentID] = PhasedProvider.assignments.all[assignmentID];
          else
            delete PhasedProvider.assignments[assignmentContainerName][assignmentID];
        }

        for (var assignmentID in PhasedProvider.assignments[assignmentContainerName]) {
          if (!(assignmentID in PhasedProvider.assignments.all)) {
            delete PhasedProvider.assignments[assignmentContainerName][assignmentID];
          }
        }
      }

      // set up watchers
      var refString = 'team/' + PhasedProvider.team.name + '/assignments';

      FBRef.child(refString + '/all').on('value', updateAllAssignments);

      FBRef.child(refString + '/to/' + PhasedProvider.user.uid).on('value', function(data) {
        data = data.val();
        updateAssignmentGroup(data, 'to_me');
      });

      FBRef.child(refString + '/by/' + PhasedProvider.user.uid).on('value', function(data) {
        data = data.val();
        updateAssignmentGroup(data, 'by_me');
      });

      FBRef.child(refString + '/unassigned').on('value', function(data) {
        data = data.val();
        updateAssignmentGroup(data, 'unassigned');
      });
    }; // end doWatchAssignments()

    // updates 'all' property of an assignment container (eg, assignments.all or archive.all)
    // matches all to incoming data
    // internal only
    var updateContainerAll = function(container, data) {
      var all;
      if (container == 'assignments')
        all = PhasedProvider.assignments.all;
      else if (container == 'archive')
        all = PhasedProvider.archive.all;
      else
        return;

      if (!data) {
        all = {};
        return;
      }

      // 1. if assignment doesn't exist in all, add it, end of story
      // 2. else, check its properties and update those that are out of sync
      // (i is the assignment uid)
      for (var i in data) {
        if (!(i in all)) {
          // 1.
          all[i] = data[i];

        } else {
          // 2.
          // a. sync extant properties in all, delete those no longer in data
          // b. add new properties from data
          // (j is property name)

          for (var j in all[i]) {
            // a.
            if (j in data[i]) {
              all[i][j] = data[i][j];
            } else {
              delete all[i][j];
            }
          }

          for (var j in data[i]) {
            // b.
            if (!(j in all[i])) {
              all[i][j] = data[i][j];
            }
          }

        }
      } // end for var i in data

      // if assignment isn't in data, delete it in all
      for (var i in all) {
        if (!(i in data)) {
          delete all[i];
        }
      }
    }


    /**
    *
    * gets archived tasks at the requested address
    *
    * 1. checks that address is valid
    * 2. makes firebase calls that fill PhasedProvider.archive.all and archiveIDs[address]
    * 3. calls syncArchive which fills out PhasedProvider.archive[address]
    *
    * on demand, not watched
    * can get to_me, by_me, and unassigned
    */
    var _getArchiveFor = function(address) {
      registerAsync(doGetArchiveFor, address);
    }

    var doGetArchiveFor = function(address) {
      ga('send', 'event', 'Archive', 'archive viewed');
      var archivePath = 'team/' + PhasedProvider.team.name + '/assignments/archive/',
        pathSuffix = '';

      // 1
      // in 'all' case, get entire archive and indexes and be done with it
      // for every other valid address, only get that index key and all
      switch(address) {
        case 'all' :
          FBRef.child(archivePath).once('value', function(data){
            data = data.val() || [];

            updateContainerAll('archive', data.all);
            archiveIDs.to_me = data.to ? objToArray(data.to[_Auth.user.uid]) : [];
            archiveIDs.by_me = data.by ? objToArray(data.by[_Auth.user.uid]) : [];
            archiveIDs.unassigned = objToArray(data.unassigned);

            syncArchive('to_me');
            syncArchive('by_me');
            syncArchive('unassigned');
          });
          return;
        case 'to_me' :
          pathSuffix = 'to/' + PhasedProvider.user.uid;
          break;
        case 'by_me' :
          pathSuffix = 'by/' + PhasedProvider.user.uid;
          break;
        case 'unassigned' :
          pathSuffix = 'unassigned';
          break;
        default:
          return;
      }

      // 2
      // get archive/all
      FBRef.child(archivePath + 'all').once('value', function(data){
        PhasedProvider.archive.all = data.val() || [];

        // if other call is complete
        if (archiveIDs[address])
          syncArchive(address); // 3
      });

      // get appropriate IDs
      FBRef.child(archivePath + pathSuffix).once('value', function(data){
        archiveIDs[address] = objToArray(data.val());

        // if other call is complete
        if ('all' in PhasedProvider.archive)
          syncArchive(address); // 3
      });
    }

    /**
    *
    * links up the archived tasks from the archiveContainerName to the appropriate $scope.archive address
    * (sim to syncAssignments())
    */
    var syncArchive = function(archiveContainerName) {
      if (!(archiveContainerName in archiveIDs)) return; // ensures valid address

      var UIDContainer = archiveIDs[archiveContainerName];

      for (var i in UIDContainer) {
        var assignmentID = UIDContainer[i];
        if (assignmentID in PhasedProvider.archive.all)
          PhasedProvider.archive[archiveContainerName][assignmentID] = PhasedProvider.archive.all[assignmentID];
        else
          delete PhasedProvider.archive[archiveContainerName][assignmentID];
      }
    }

    /**
    *
    * moves a task to or from the archive
    *
    * 1.A remove from /to/(me) or /unassigned (& note which)
    * 1.B remove from /by
    * 1.C remove from /all
    *
    * 2.A add to archive/to/(me) or archive/unassigned
    *   depending on which it was removed from
    * 2.B add to archive/by
    * 2.C add to archive/all
    * 2.D add to $scope.archive.all and run sync, since archive isn't watched
    */
    var _moveToFromArchive = function(assignmentID, unarchive) {
      var args = {
        assignmentID : assignmentID,
        unarchive : unarchive
      }
      registerAsync(doMoveToFromArchive, args);
    }

    var doMoveToFromArchive = function(args) {
      ga('send', 'event', 'Task', 'task archived');
      var path = "team/" + PhasedProvider.team.name + "/assignments/",
        to_me = false,
        idsContainer = assignmentIDs,
        assignmentContainer = PhasedProvider.assignments,
        assignmentID = args.assignmentID,
        unarchive = args.unarchive || false,
        assignment;

      // ensure assignment is where it should be and get a reference
      if (unarchive) {
        // assignment should be in PhasedProvider.archive.all
        if (assignmentID in PhasedProvider.archive.all)
          assignment = PhasedProvider.archive.all[assignmentID];
        else {
          // not where it should be, break
          console.log('assignment ' + assignmentID + ' missing from memory');
          return false;
        }
      } else {
        // assignment should be in PhasedProvider.assignments.all
        if (assignmentID in PhasedProvider.assignments.all)
          assignment = PhasedProvider.assignments.all[assignmentID];
        else {
          // not where it should be, break
          console.log('assignment ' + assignmentID + ' missing from memory');
          return false;
        }
      }

      assignment = makeTaskForDB(assignment);
      if (!assignment) return; // makeTaskForDB failed

      // -1.A
      // reverse everything if unarchive is true:
      // remove from archiveIDs and PhasedProvider.archive here...
      if (unarchive) {
        path += 'archive/';
        idsContainer = archiveIDs;
        assignmentContainer = PhasedProvider.archive;
        ga('send', 'event', 'Task', 'task unarchived');
      } else {
        ga('send', 'event', 'Task', 'task archived');
      }

      // 1. REMOVAL

      // 1.A
      if (idsContainer.to_me && idsContainer.to_me.indexOf(assignmentID) > -1) {
        to_me = true;
        FBRef.child(path + 'to/' + PhasedProvider.user.uid).set(popFromList(assignmentID, idsContainer['to_me']));
      }
      else if (idsContainer.unassigned && idsContainer.unassigned.indexOf(assignmentID) > -1) {
        to_me = false;
        FBRef.child(path + 'unassigned').set(popFromList(assignmentID, idsContainer['unassigned']));
      }
      else {
        console.log('not found in to_me or unassigned (' + assignmentID + ')', idsContainer.to_me, idsContainer.unassigned);
        return;
      }

      // 1.B
      FBRef.child(path + 'by/' + PhasedProvider.user.uid).set(popFromList(assignmentID, idsContainer['by_me']));

      // 1.C
      FBRef.child(path + 'all/' + assignmentID).remove();

      // -1.B
      if (unarchive) {
        path = "team/" + PhasedProvider.team.name + "/assignments/";
        idsContainer = assignmentIDs;
        assignmentContainer = PhasedProvider.assignments;
      } else {
        path += 'archive/';
        idsContainer = archiveIDs;
        assignmentContainer = PhasedProvider.archive;
      }

      // 2. ADDAL

      // 2.A
      // for this and 2.B, have to get list from server (in add to archive case)
      if (to_me) {
        FBRef.child(path + 'to/' + PhasedProvider.user.uid).once('value', function(data){
          data = data.val();
          idsContainer['to_me'] = data || [];
          idsContainer['to_me'].push(assignmentID);
          FBRef.child(path + 'to/' + PhasedProvider.user.uid).set(idsContainer['to_me']);
          if ('all' in PhasedProvider.archive) syncArchive('to_me');
        });
      }
      else { // unassigned
        FBRef.child(path + 'unassigned').once('value', function(data){
          data = data.val();
          idsContainer['unassigned'] = data || [];
          idsContainer['unassigned'].push(assignmentID);
          FBRef.child(path + 'unassigned').set(idsContainer['unassigned']);
          if ('all' in PhasedProvider.archive) syncArchive('unassigned');
        });
      }

      // 2.B
      FBRef.child(path + 'by/' + PhasedProvider.user.uid).once('value', function(data){
        data = data.val();
        idsContainer['by_me'] = data || [];
        idsContainer['by_me'].push(assignmentID);
        FBRef.child(path + 'by/' + PhasedProvider.user.uid).set(idsContainer['by_me']);
      });

      // 2.C
      FBRef.child(path + 'all/' + assignmentID).set(assignment); // remote

      // 2.D
      if (unarchive)
        delete PhasedProvider.archive.all[assignmentID];
      else
        PhasedProvider.archive.all[assignmentID] = assignment; // local, since archive isn't watched
    }

    /**
    *
    * watchs a member's assignments
    *
    * 1. get all assignments (once)
    * 2. watch assigned /to/[user] and /by/[user]
    * 3. push appropriate assignments from all into user.assignments.to_me or .by_me
    *   (allowing the same object to be in both arrays at once)
    *
    */
    var _watchMemberAssignments = function(id) {
      registerAsync(doWatchMemberAssignments, id);
    }

    var doWatchMemberAssignments = function(id) {
      var user = PhasedProvider.team.members[id];
      user.assignments = {
        to_me : [],
        by_me: []
      }

      // 1.
      var refString = 'team/' + PhasedProvider.team.name + '/assignments';
      FBRef.child(refString + '/all').once('value', function(data) {
        var all = data.val();
        if (!all) return;

        // 2.
        FBRef.child(refString + '/to/' + id).on('value', function(data) {
          data = data.val();
          if (!data) return;
          data = objToArray(data);

          // 3.
          // for each index in the to_me list, check if it's in all
          // if it is, push it to the array
          for (var i in data) {
            if (data[i] in all)
              user.assignments.to_me.push(all[data[i]]);
          }
        });

        // 2. same as above
        FBRef.child(refString + '/by/' + id).on('value', function(data) {
          data = data.val();
          if (!data) return;
          data = objToArray(data);

          // 3.
          for (var i in data) {
            if (data[i] in all)
              user.assignments.by_me.push(all[data[i]]);
          }
        });
      });
    }

    /**
    *
    * adds a task
    * 1. check & format input
    * 2. push to db
    *
    */
    var _addAssignment = function(newTask) {
      registerAsync(doAddAssignment, newTask);
    }

    var doAddAssignment = function(newTask) {
      ga('send', 'event', 'Task', 'task added');

      // 1. clean newTask
      newTask.user = _Auth.user.uid;
      newTask = makeTaskForDB(newTask);
      if (!newTask) return; // makeTask failed

      // 2. push to db

      // 2A add task to team/(teamname)/assignments/all
      // 2B add references to /to/assignee or /unassigned and /by/me

      var team = PhasedProvider.team.name,
        assignmentsRef = FBRef.child('team/' + team + '/assignments');

      // 2A
      var newTaskRef = assignmentsRef.child('all').push(newTask);
      var newTaskID = newTaskRef.key();
      // 2B
      assignmentIDs['by_me'].push(newTaskID);
      assignmentsRef.child('by/' + PhasedProvider.user.uid).set(assignmentIDs['by_me']);

      // get array, push (array style), send back to server
      var path = newTask.unassigned ? 'unassigned' : 'to/' + newTask.assignee;
      assignmentsRef.child(path).once('value', function(data) {
        data = data.val();
        data = data || [];
        data = objToArray(data);
        data.push(newTaskID);
        assignmentsRef.child(path).set(data);
      });
    }

    // makes a clean copy of the newTask for the db with the expected properties,
    // as well as verifying that they're type we expect
    // returns the clean copy
    // expandable: just add property names to the appropriate objects and the loops do the rest
    var makeTaskForDB = function(newTask) {
      // properties to check
      var required = {
        strings : ['name', 'user'],
        numbers : [],
        booleans: []
      };
      var optional = {
        strings : ['cat', 'weather', 'taskPrefix', 'photo', 'assignee', 'assigned_by', 'city'],
        numbers : ['deadline', 'priority', 'status'],
        booleans : ['unassigned']
      };

      // clean output object
      var status = {
        time: new Date().getTime()
      };

      // check for location
      if ((typeof newTask.location).toLowerCase() === 'object' &&
          (typeof newTask.location.lat).toLowerCase() === 'number' &&
          (typeof newTask.location.long).toLowerCase() === 'number') {
        status.location = {
          lat : newTask.location.lat,
          long : newTask.location.long
        }
      }

      // BATCH CHECKS:
      // required strings
      for (var i in required.strings) {
        if ((typeof newTask[required.strings[i]]).toLowerCase() === 'string') {
          status[required.strings[i]] = newTask[required.strings[i]];
        } else {
          console.log('required property "' + required.strings[i] + '" not found in newTask; aborting');
          return;
        }
      }

      // required numbers
      for (var i in required.numbers) {
        if ((typeof newTask[required.numbers[i]]).toLowerCase() === 'number'
          && !isNaN(newTask[required.numbers[i]])) {
          status[required.numbers[i]] = newTask[required.numbers[i]];
        } else {
          console.log('required property "' + required.numbers[i] + '" not found in newTask or is NaN; aborting');
          return;
        }
      }

      // booleans
      for (var i in required.booleans) {
        if ((typeof newTask[required.booleans[i]]).toLowerCase() === 'boolean') {
          status[required.booleans[i]] = newTask[required.booleans[i]];
        } else {
          console.log('required property "' + required.booleans[i] + '" not found in newTask; aborting');
          return;
        }
      }

      // optional strings
      for (var i in optional.strings) {
        if ((typeof newTask[optional.strings[i]]).toLowerCase() === 'string') {
          status[optional.strings[i]] = newTask[optional.strings[i]];
        }
      }

      // optional numbers
      for (var i in optional.numbers) {
        if ((typeof newTask[optional.numbers[i]]).toLowerCase() === 'number'
          && !isNaN(newTask[optional.numbers[i]])) {
          status[optional.numbers[i]] = newTask[optional.numbers[i]];
        }
      }

      // booleans
      for (var i in optional.booleans) {
        if ((typeof newTask[optional.booleans[i]]).toLowerCase() === 'boolean') {
          status[optional.booleans[i]] = newTask[optional.booleans[i]];
        }
      }

      return status;
    }

    /**
    *
    * sets an assigned task to the user's active task
    * and sets status of that task to "In Progress" (0)
    *
    */
    var _activateTask = function (assignmentID) {
      registerAsync(doActivateTask, assignmentID);
    }

    var doActivateTask = function(assignmentID) {
      ga('send', 'event', 'Update', 'submitted');
      ga('send', 'event', 'Task', 'activated');

      // copy task so we don't damage the original assignment
      var task = angular.copy(PhasedProvider.assignments.all[assignmentID]);

      // update time to now and place to here (feature pending)
      task.time = new Date().getTime();
      // task.lat = $scope.lat ? $scope.lat : 0;
      // task.long = $scope.long ? $scope.long : 0;

      // in case of unassigned tasks, which don't have a user property
      task.user = PhasedProvider.user.uid;

      // update original assignment status to In Progress
      _setAssignmentStatus(assignmentID, PhasedProvider.TASK_STATUS_ID.IN_PROGRESS);

      // publish to stream
      var ref = FBRef.child('team/' + PhasedProvider.team.name);
      ref.child('task/' + PhasedProvider.user.uid).set(task);
      ref.child('all/' + PhasedProvider.user.uid).push(task);
    }

    /**
    *
    * sends a status update to the server, pushes to team
    * these are the normal status updates used in /feed
    *
    * cleans newTask first. fails if bad data
    *
    */

    var _addTask = function(newTask) {
      registerAsync(doAddTask, newTask);
    }

    var doAddTask = function(newTask) {
      ga('send', 'event', 'Update', 'submitted');
      ga('send', 'event', 'Task', 'task added');

      // clean task
      newTask = makeTaskForDB(newTask);
      if (!newTask) return;

      // publish to stream
      var ref = FBRef.child('team/' + PhasedProvider.team.name);
      ref.child('task/' + PhasedProvider.user.uid).set(newTask);
      ref.child('all/' + PhasedProvider.user.uid).push(newTask);
    }

    /**
    *
    * sets an assignment's status
    * fails if newStatus isn't valid
    */
    var _setAssignmentStatus = function(assignmentID, newStatus) {
      var args = {
        assignmentID : assignmentID,
        newStatus : newStatus
      }
      registerAsync(doSetAssignmentStatus, args);
    }

    var doSetAssignmentStatus = function(args) {
      var assignmentID = args.assignmentID,
        newStatus = args.newStatus;
      if (!(newStatus in PhasedProvider.TASK_STATUSES)) { // not a valid ID
        var i = PhasedProvider.TASK_STATUSES.indexOf(newStatus);
        if (i !== -1) {
          console.log(newStatus + ' is a valid status name');
          newStatus = i; // set newStatus to be status ID, not name
        } else {
          console.log('err: ' + newStatus + ' is not a valid status name or ID');
          return;
        }
      }
      ga('send', 'event', 'Task', 'task status update: ' + PhasedProvider.TASK_STATUSES[newStatus]);

      // push to database
      FBRef.child('team/' + PhasedProvider.team.name + '/assignments/all/' + assignmentID + '/status').set(newStatus);

      // if issue was complete, timestamp it
      if (newStatus == 1) {
        var time = new Date().getTime();
        FBRef.child('team/' + PhasedProvider.team.name + '/assignments/all/' + assignmentID).update({"completeTime" : time});
      }
    }

    /**
    *
    * moves a task from /unassigned into /to/(me)
    * without touching status
    *
    */
    var _takeTask = function(assignmentID) {
      registerAsync(doTakeTask, assignmentID);
    }

    var doTakeTask = function(assignmentID) {
      ga('send', 'event', 'Task', 'task taken');
      var assignmentsPath = 'team/' + PhasedProvider.team.name + '/assignments/';

      // 1. remove task from /unassigned
      delete assignmentIDs.unassigned[assignmentIDs.unassigned.indexOf(assignmentID)];
      FBRef.child(assignmentsPath + 'unassigned').set(assignmentIDs.unassigned);

      // 2. add task to /to/(me)
      assignmentIDs.to_me.push(assignmentID);
      FBRef.child(assignmentsPath + 'to/' + PhasedProvider.user.uid).set(assignmentIDs.to_me);

      // 3. set assignee attr
      FBRef.child(assignmentsPath + 'all/' + assignmentID + '/assignee').set(PhasedProvider.user.uid);
    }

    /**
    *
    * adds a member
    * Brian's better add member function
    * 1. checks if member is in /profile
    * 2A. if so, adds to /team-invite-existing-member and registers current team on member's profile
    * 2B. if not, checks whether they are a profile in waiting
    * 2B1. if they are, add team to newMember's profile
    * 2B2. if not, add to /profile-in-waiting and /profile-in-waiting2
    */

    var _addMember = function(newMember, inviter) {
      var args = {
        newMember : newMember,
        inviter : inviter
      }
      console.log(args);
      registerAsync(doAddMember, args);
    }

    var doAddMember = function(args) {
      ga('send', 'event', 'Team', 'Member added');
      console.log(args);
      var invited = args.newMember,
        inviter = args.inviter;

      invited.email = invited.email.toLowerCase(); // Change text to lowercase regardless of user input.

      //Brian's better add member function
      // find if memeber is already in db
      // console.log(names.email);
      FBRef.child("profile").orderByChild("email").startAt(invited.email).endAt(invited.email).limitToFirst(1).once('value',function(user){
        user = user.val();
        // console.log(user);
        if (user) {
          //console.log('invite sent to current user');
          var k = Object.keys(user);
          var memberData = {
            teams : { 0 : PhasedProvider.team.name },
            email : invited.email,
            inviteEmail: _Auth.user.email,
            inviteName: _Auth.user.name
          }
          FBRef.child('team-invite-existing-member').push(memberData);
          FBRef.child('profile/' + k[0] + '/teams').push(PhasedProvider.team.name);
        } else {
          //console.log('invited is not a current user, looking to see if they are in profile-in-waiting');

          FBRef.child("profile-in-waiting").orderByChild("email").startAt(invited.email).endAt(invited.email).limitToFirst(1).once('value',function(user){
            user = user.val();

            if (user) {
              //console.log('invite sent to user in profile-in-waiting');

              var y = Object.keys(user);
              FBRef.child('profile-in-waiting').child(y[0]).child('teams').push(PhasedProvider.team.name);
            } else {
              //console.log('invited is new to the system, setting up profile-in-waiting');
              var PIWData = {
                'teams' : { 0 : PhasedProvider.team.name},
                'email' : invited.email,
                'inviteEmail': inviter.email,
                'inviteName': inviter.name
              };
              FBRef.child('profile-in-waiting').push(PIWData);
              FBRef.child('profile-in-waiting2').push(PIWData);
            }
          });
        }
      });
    }

    /**
    *
    * adds a team
    * function mostly copied from chromeapp ctrl-createTeam.js
    * 1. check if teamname is taken
    * 2A. if not:
    *  - create the team in /team
    *  - add to current user's profile
    *  - make it their current team
    *  - run success callback if it exists
    * 2B. if it does exist, run fail callback if it exists
    */

    var _addTeam = function(teamName, success, failure) {
      var args = {
        teamName : teamName,
        success : success,
        failure : failure
      }
      registerAsync(doAddTeam, args);
    }

    var doAddTeam = function(args) {
      FBRef.child('team/' + args.teamName).once('value', function(snapshot) {
        //if exists
        if(snapshot.val() == null) {
          FBRef.child('team/' + args.teamName + '/members/' + _Auth.user.uid).set(true,function(){
            FBRef.child('profile/' + _Auth.user.uid + '/teams').push(args.teamName,function(){
              var switchArgs = {
                teamName : args.teamName,
                callback : args.success
              }
              doSwitchTeam(switchArgs);
            });
          });
        } else {
          if (args.failure)
            args.failure();
        }
      });
    }


    /**
    *
    * switches current user's active team
    * optionally calls a callback
    */

    var _switchTeam = function(teamName, callback) {
      var args = {
        teamName : teamName,
        callback : callback
      }
      registerAsync(doSwitchTeam, args);
    }

    var doSwitchTeam = function(args) {
      // reset team
      PhasedProvider.team.name = args.teamName;
      PhasedProvider.team.members = {};
      PhasedProvider.team.lastUpdated = [];
      PhasedProvider.team.history = [];
      PhasedProvider.team.teamLength = 0;

      // remove old event handlers
      FBRef.child(setUpTeamMembers.address).off('value');

      // reload team data
      setUpTeamMembers();
      if (WATCH_ASSIGNMENTS)
        watchAssignments();

      // update profile curTeam attr
      FBRef.child('profile/' + _Auth.user.uid + '/curTeam').set(args.teamName, function() {
        if (args.callback)
          args.callback();
      });
    }

    /**
    **
    **  Utilities
    **
    **/

    /**
    *
    * remove an item from an array
    * returns the new array
    *
    */
    var popFromList = function(item, list) {
      var i = list.indexOf(item);
      while (i > -1) {
        delete list[i];
        i = list.indexOf(item);
      }
      return list;
    }

    // convert object into array
    // useful for arrays with missing keys
    // eg, [0 = '', 1 = '', 3 = ''];
    var objToArray = function(obj) {
      var newArray = [];
      for (var i in obj) {
        newArray.push(obj[i]);
      }
      return newArray;
    }


  })
  .config(['PhasedProvider', 'FURL', 'AuthProvider', function(PhasedProvider, FURL, AuthProvider) {
    PhasedProvider.setFBRef(FURL);
    PhasedProvider.setWatchHistory(true);
    PhasedProvider.setWatchAssignments(true);

    // configure phasedProvider as a callback to AuthProvider
    AuthProvider.setDoAfterAuth(PhasedProvider.init);
  }]);
