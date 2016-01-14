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
      filtered.push(items[i]);
    }
    filtered.sort(function (a, b) {
      return (a[field] > b[field] ? 1 : -1);
    });
    if(reverse) filtered.reverse();
    return filtered;
  };
})
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
  $scope.currentUser = Phased.user.profile;



  // ensure view updates when new members are added
  // members data retrieved
  $scope.$on('Phased:membersComplete', function() {
    $scope.$apply();
  });

  // history retrieved
  $scope.$on('Phased:historyComplete', function() {
    $scope.$apply();
    console.log(Phased);
  });

  // update bg image based on day of the week
  var monImage =  "weekdayPhotos/mon.jpg";
  var tuesImage =  "weekdayPhotos/tues.jpg";
  var wedImage =  "weekdayPhotos/wed.jpg";
  var thursImage =  "weekdayPhotos/thurs.jpg";
  var friImage = "weekdayPhotos/fri.jpg";
  var satImage = "weekdayPhotos/sat.jpg";
  var sunImage = "weekdayPhotos/sun.jpg";

  var d=new Date();
  // console.log(d.getDay());

  var backgroundImage = [sunImage, monImage, tuesImage, wedImage, thursImage, friImage, satImage];
  $scope.dayImage = backgroundImage[d.getDay()];

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

    // 1. format incoming status data
  	if ($scope.taskForm.$error.maxlength){
  		alert('Your update is too long!');
      return;
  	}

    var key = $scope.catKey;
    var taskPrefix = '';
    var team = Auth.team;
    var weather,city,lat,long,photo;

    key = $scope.catKey ? $scope.catKey : '';
    city = $scope.city ? $scope.city : 0;
    lat = $scope.lat ? $scope.lat : 0;
    long = $scope.long ? $scope.long : 0;
    photo = $scope.bgPhoto ? $scope.bgPhoto : 0;
    var status = {
      name: taskPrefix+update,
      time: new Date().getTime(),
      user:Auth.user.uid,
      cat : key,
      city:city,
      weather:'',
      taskPrefix : taskPrefix,
      photo : photo,
      location:{
        lat : lat,
        long : long
      }
    };

    // 2. update db
    Phased.addTask(status);

    // 3. update interface
    $scope.task = update;
    $scope.taskName = '';
	  $scope.showTaskView = true;
    $scope.taskTime = status.time; // we didnt have status.time so i think this fixes the problem(?)
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
