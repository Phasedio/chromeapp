/**
  *
  * allows ordering an object as if it were an array,
  * at the cost of being able to access its original index
  * Adds a property 'key' with the original index to
  * address this
  *
  */
app.filter('orderObjectBy', function() {
  return function(items, field, reverse) {
    var filtered = [];
    for (var i in items) {
      items[i].key = i;
      items[i].lastUpdated = items[i].currentStatus.time;
      filtered.push(items[i]);
    }
    filtered.sort(function (a, b) {
      return (a[field] > b[field] ? 1 : -1);
    });
    if(reverse) filtered.reverse();
    //console.log(filtered);
    return filtered;
  };
})/**
  * filters tasks by status
  *
  * (preface statusID with ! to filter out statuses)
  */
  .filter('filterTaskByStatus', function() {
    return function(input, statusID) {
      if (!input) return input;
      if (!statusID) return input;
      var expected = ('' + statusID).toLowerCase(); // compare lowercase strings
      var result = {}; // output obj

      if (expected[0] === '!') {
        expected = expected.slice(1); // remove leading !
        // negative filter -- filter out tasks with status
        angular.forEach(input, function(value, key) {
          var actual = ('' + value.status).toLowerCase(); // current task's status
          if (actual !== expected) {
            result[key] = value; // preserves index
          }
        });
      } else {
        // only include tasks with status
        angular.forEach(input, function(value, key) {
          var actual = ('' + value.status).toLowerCase(); // current task's status
          if (actual === expected) {
            result[key] = value; // preserves index
          }
        });
      }

      return result;
    }
  })
  /**
  * filters tasks by category
  *
  * (preface statusID with ! to filter out statuses)
  */
  .filter('filterTaskByCategory', function() {
    return function(input, catID) {
      if (!input) return input;
      if (!catID) return input;
      var expected = ('' + catID).toLowerCase(); // compare lowercase strings
      var result = {}; // output obj

      if (expected[0] === '!') {
        expected = expected.slice(1); // remove leading !
        // negative filter -- filter out tasks with cat
        angular.forEach(input, function(value, key) {
          var actual = ('' + value.cat).toLowerCase(); // current task's cat
          if (actual !== expected) {
            result[key] = value; // preserves index
          }
        });
      } else {
        // only include tasks with cat
        angular.forEach(input, function(value, key) {
          var actual = ('' + value.cat).toLowerCase(); // current task's cat
          if (actual === expected) {
            result[key] = value; // preserves index
          }
        });
      }

      return result;
    }
  });
app.controller('MainInteractionController',function($scope,FURL,Auth,Phased,$http,$location, toaster,ngDialog){

	$scope.showTaskView = false;
	$scope.task = '';
  $scope.masterTask = '';
	$scope.taskTime = 0;
	$scope.team = '';
	$scope.taskPrefix = 'current';
	$scope.teamMembers = [];
	$scope.memberLimit = 2;
	$scope.selected = {};
	$scope.taskHistory = [];
	$scope.showsetting = false;
	$scope.teamExpander = {
		expand : false,
		full : false
	};


  // PhasedProvider integrations
  // n.b.: categories now in Phased.team.categorySelect and in Phased.team.categoryObj (different structures)
  // n.b.: Phased.user.profile is a link to Phased.team.members[Auth.user.uid].profile;
  $scope.team = Phased.team;

  console.log(Phased);
  $scope.currentUser = Phased.user;
  //
  //$scope.archive = Phased.archive;

  $scope.activeStream = Phased.assignments.to_me;
  $scope.activeStreamName = 'assignments.to_me';
  $scope.activeStatusFilter = '!1'; // not completed tasks
  $scope.activeCategoryFilter;
  $scope.filterView = $scope.activeStreamName;//for the select filter


  // ensure view updates when new members are added
  // members data retrieved
  $scope.$on('Phased:membersComplete', function() {
    $scope.currentUser = Phased.user;
    $scope.assignments = Phased.team.projects['0A'].columns['0A'].cards['0A'].tasks;
    $scope.$apply();

  });
  $scope.$on('Phased:memberChanged',function(){
    $scope.$apply();
  });

  // history retrieved
  $scope.$on('Phased:historyComplete', function() {

    $scope.$apply();

    console.log(Phased);
  });


  // check if newUser is set; if so, show the newUser tutorial
  // (when the current user's profile data comes in in PhasedProvider)
  // replaces newUserCheck
  $scope.$on('Phased:currentUserProfile', function() {
    if (Phased.user.profile.newUser) {
      _gaq.push(['_trackEvent', 'Tutorial', 'Main interaction']);
      ngDialog.open({
          template: 'views/partials/onboardMain.html',
          className: 'ngdialog-theme-plain',
          scope: $scope
        });
    } else {
      $scope.currentUser = Phased.user.profile;
      $scope.$apply();
    }
  });

  // register jquery listeners
  $(document).ready(function() {
    // show tooltips on hover
    $('[data-toggle=tooltip]').hover(function(){
      $(this).tooltip('show'); // on mouseenter
    }, function(){
      $(this).tooltip('hide');  // on mouseleave
    });
  });


  // toggle showing more categories
  $scope.moreCat = function(){
    $('#catModal').modal('toggle');
  };

  // select a category
  $scope.categoryChoice = function(key, choice, color, closeModal){
    console.log('button was clicked with choice of:', choice);
    $scope.taskCat = true;
    $scope.catKey = key;
    $scope.taskChoice = choice;
    $scope.taskColor = color;
    if(closeModal){
      $('#catModal').modal('toggle');
    }
  };

  // add a task
  // 1. format incoming data
  // 2. PhasedProvider pushes to db
  // 3. update interface
	$scope.addTask = function(update){
    _gaq.push(['_trackEvent', 'Update', 'updated']);

    //var key = $scope.catKey;

    // prepare task object
    var team = Phased.team.name;
    if ($scope.taskForm.$error.maxlength) {
      alert('Your update is too long!');
      return;
    }

    var taskPrefix = '';

    var status = {
      name: taskPrefix + update,
      // time: new Date().getTime(), // added in PhasedProvider.makeTaskForDB (internal fn)
      user: Auth.user.uid,
      cat : $scope.catKey || '',
      city: $scope.city || 0,
      weather: '',
      taskPrefix : taskPrefix,
      photo : $scope.bgPhoto || 0,
      location: {
        lat : $scope.lat || 0,
        long : $scope.long || 0
      }
    };

    console.log('status:', status);
    // push to db
    Phased.addStatus(status);

    // reset interface
    $scope.selectedCategory = undefined;
    $scope.task = {};
    $scope.taskName ='';

	};

  // returns current task prefix
	function getTaskPrefix(){
	    var r = '';
	    switch ($scope.taskPrefix){
	      case 'current':
	        r = 'Is currently ';
	        break;
	      case 'starting':
	        r = 'Has started ';
	        break;
	      case 'finsh':
	        r = 'Has finshed ';
	        break;
	    }
	    return r;
	}
  $scope.sendToTask = function(){
    $location.url("https://app.phased.io/tasks");
  };
  $scope.logout = function(){
    Auth.logout();
  }
  // show add member modal
  $scope.addMemberModal = function(){
  	$('#myModal').modal('toggle');
  };

  // adds a new member to the current team
  $scope.addMember = function(newUser) {
    _gaq.push(['_trackEvent', 'Team', 'Add member']);
    Phased.addMember(newUser);
    $('#myModal').modal('toggle');
  };


  //ICONS AT TOP////
  $scope.showSettings = function(){
     console.log('will show settings modal');
     //_gaq.push(['_trackEvent', 'Settings', 'Opened']);
     $('#mySettingsModal').modal('toggle');
     $scope.logout = function(){
       _gaq.push(['_trackEvent', 'Logout', 'clicked']);
       Auth.logout();
       $location.path('/login');
     };
     $scope.goToWeb = function(){
       console.log('close modal');
       $('#mySettingsModal').modal('toggle');
     };
  };

  $scope.showSwitchTeam = function(){
    $('#mySwitchModal').modal('toggle');
  };

  $scope.switchTeam = function(teamName){
    Phased.switchTeam(teamName, function callback(){
      $location.path('/');
      $('#mySwitchModal').modal('toggle');
    });
  };

  $scope.newTeam = function(){
    _gaq.push(['_trackEvent', 'Team', 'Create new team']);
    $location.path('/createteam');
  };

  $scope.gaClick = function(){
    _gaq.push(['_trackEvent', 'Open&Close Team', 'Chevron/X']);
  }

});
