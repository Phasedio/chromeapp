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
  /*$scope.$on('Phased:member', function() {
    console.dir('Phased:member');
  });*/

  // members data retrieved
  $scope.$on('Phased:membersComplete', function() {
    $scope.$apply();
  });

  // history retrieved
  $scope.$on('Phased:historyComplete', function() {
    $scope.$apply();
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

  // not used
  /*$scope.closeAll = function(){
    _gaq.push(['_trackEvent', 'Tutorial', 'Main interaction - other closed']);
    new Firebase(FURL).child('profile').child(Auth.user.uid).child('newUser').set(false);
    ngDialog.close();
  }*/

  // not used
  /*$scope.next = function(){
    _gaq.push(['_trackEvent', 'Tutorial', 'Main interaction - button closed']);
    new Firebase(FURL).child('profile').child(Auth.user.uid).child('newUser').set(false);
    ngDialog.close();
  }*/


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

  // not used
	/*$scope.hideAllOpen = function(){
		$scope.teamExpander = {
			expand : false,
			full : false
		}
	}*/

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

  // not used
	/*$scope.openUp = function(string){
    _gaq.push(['_trackEvent', 'Team', 'Open&Close']);
		if($scope.teamExpander[string]){
			$scope.teamExpander = {
				expand : false,
				full : false
			};
			$scope.memberLimit = 2;
			$scope.selected = {};
		}else{
			$scope.teamExpander[string] = true;
			$scope.memberLimit = $scope.teamMembers.length;
		}
    if($scope.flipStatus){
      $scope.flipStatus = false;
    }else{
      $scope.flipStatus = true;
    }
	}*/

  // show add member modal
  $scope.addMemberModal = function(){
  	$('#myModal').modal('toggle');
  };

  // adds a new member to the current team
  $scope.addMembers = function(names){
    _gaq.push(['_trackEvent', 'Team', 'Add member']);
  	var ref = new Firebase(FURL);
    // grab all users and see if they match an email in the system
    ref.child('profile').once('value', function(data){
      data = data.val();

      var selectedUID = Object.keys(data);
      var isSet = false;

      // if this email matches the one from the profile page assign this team to their account
      for(var y = 0; y < selectedUID.length; y++){
        console.log('test3');
        if(names.email == data[selectedUID[y]].email){
          isSet = true;
          //get the key of the uid

          //save to new node so that zapier can email.
          ref.child('team-invite-existing-member').push({teams : { 0 : Auth.team},email : names.email, inviteEmail: $scope.currentUser.email, inviteName: $scope.currentUser.name });

          //push new team to member
          ref.child('profile').child(selectedUID[y]).child('teams').push(Auth.team);
          break;
        }
      }
      // if no matches are found create a profile-in-waiting with this team assigned.
      if(!isSet){
        console.log(names.email, $scope.currentUser);

        // loop profile-in-waiting to find a match
        ref.child('profile-in-waiting').once('value', function(data){
          data = data.val();
          var selectedUID = Object.keys(data);
          var thisSet = false;
          for(var y = 0; y < selectedUID.length; y++){
            console.log(data[selectedUID[y]].email);
            if(names.email == data[selectedUID[y]].email){
              thisSet = true;
              //check if email already has team attached
              var userTeams = Object.keys(data[selectedUID[y]].teams);
              var profileOfUser = data[selectedUID[y]];
              var change = false;

              for(var u = 0; u < userTeams.length; u++){
                if(profileOfUser.teams[userTeams[u]] == Auth.team){
                  break;
                }else{
                  change = true;
                  break;
                }
              }
              if(change){
                //push new team to member
                ref.child('profile-in-waiting').child(selectedUID[y]).child('teams').push(Auth.team);
                //sendTheMail(msg);
                break;
              }
            }
          }
          if(!thisSet){
            ref.child('profile-in-waiting').push({teams : { 0 : Auth.team},email : names.email, inviteEmail: $scope.currentUser.email, inviteName: $scope.currentUser.name });
            ref.child('profile-in-waiting2').push({teams : { 0 : Auth.team},email : names.email, inviteEmail: $scope.currentUser.email, inviteName: $scope.currentUser.name });


            //sendTheMail(msg);
          }
        });
      }
    });
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
    // $scope.userTeams = [];

    // var returnObj = [];

    /*new Firebase(FURL).child('profile').child(Auth.user.uid).child('teams').once('value', function(data){
      data = data.val();
      if(data){
        var keys = Object.keys(data);
        for(var i = 0; i < keys.length; i++){
          console.log(data[keys[i]]);
          var obj = {
            name : data[keys[i]],
            number : getTeamNumber(data[keys[i]])
          };
          $scope.userTeams.push(obj);
          console.log($scope.userTeams);
          $scope.$apply();
        }
      }
    });*/
      //$scope.getTeams();

  };

  $scope.switchTeam = function(teamName){
    console.log('clicked switch team');
    Phased.switchTeam(teamName, function callback(){
      $location.path('/');
      $('#mySwitchModal').modal('toggle');
    })
    /*new Firebase(FURL).child('profile').child(Auth.user.uid).child('curTeam').set(teamName,function(){
      console.log(teamName);
      $location.path('/');
      $('#mySwitchModal').modal('toggle');
    })*/
  };

  /*$scope.newTeam = function(){
    $location.path('/createteam');
  };*/

  /*function getTeamNumber(team){
    new Firebase(FURL).child('team').child(team).child('members').once('value', function(members){
      members = members.val();
      members = Object.keys(members);
      return members.length;

    });
  };*/

  //Switch team logic

  // $scope.userTeams = $scope.currentUser.profile.teams;

  /*$scope.getTeams = function(){
    var returnObj = [];

    new Firebase(FURL).child('profile').child(Auth.user.uid).child('teams').once('value', function(data){
      data = data.val();
      if(data){
        var keys = Object.keys(data);
        for(var i = 0; i < keys.length; i++){
          console.log(data[keys[i]]);
          var obj = {
            name : data[keys[i]],
            number : getTeamNumber(data[keys[i]])
          };
          $scope.userTeams.push(obj);
          console.log($scope.userTeams);
          //$scope.$apply();

        }

      }
    });
  };*/

  $scope.newTeam = function(){
    _gaq.push(['_trackEvent', 'Team', 'Create new team']);
    $location.path('/createteam');
  };

  /*function getTeamNumber(team){
    new Firebase(FURL).child('team').child(team).child('members').once('value', function(members){
      members = members.val();
      members = Object.keys(members);
      return members.length;

    });
  };*/

  $scope.gaClick = function(){
    _gaq.push(['_trackEvent', 'Open&Close Team', 'Chevron/X']);
  }

});
