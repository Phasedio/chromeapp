app.controller('MainInteractionController',function($scope,FURL,Auth,$http,$location, toaster){
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
	}


  new Firebase(FURL).child('profile').child(Auth.user.uid).once('value', function(user) {
    user = user.val();
    $scope.currentUser = user;
  });

	$scope.hideAllOpen = function(){
		$scope.teamExpander = {
			expand : false,
			full : false
		}
	}
	$scope.addTask = function(update){
    	if($scope.taskForm.$error.maxlength){
    		alert('Your update is too long!');
    	}else{
    		console.log(update);
		    var taskPrefix = '';
		    var team = Auth.team;
		    var weather,city,lat,long,photo;
		    //weather = $scope.weatherIcon != '' ? $scope.weatherIcon : 0;
		    city = $scope.city ? $scope.city : 0;
		    lat = $scope.lat ? $scope.lat : 0;
		    long = $scope.long ? $scope.long : 0;
		    photo = $scope.bgPhoto ? $scope.bgPhoto : 0;
		    var status = {
		      name: taskPrefix+update,
		      time: new Date().getTime(),
		      user:Auth.user.uid,
		      city:city,
		      weather:'',
		      taskPrefix : taskPrefix,
		      photo : photo,
		      location:{
		        lat : lat,
		        long : long
		      }


		    };
		    var teamRef = new Firebase(FURL);
		    console.log(status);
        console.log(status.time);
		    teamRef.child('team').child(team).child('task').child(Auth.user.uid).set(status);
		    teamRef.child('team').child(team).child('all').child(Auth.user.uid).push(status,function(){
		      console.log('status set');
		      $scope.updateStatus = '';
          //we are getting the user.uid, we need to extract the member off the user.uid.
          //then we can do a scope.setSelected off that member.

		      //Send push notifications to team
		      $http.get('http://45.55.200.34:8080/push/update/'+team+'/'+Auth.user.name+'/'+status.name,'').success(function(data){
		        //alert(data);
		      });

		    });
		    $scope.task = update;
        $scope.taskName = '';
			  $scope.showTaskView = true;
        $scope.taskTime = status.time; // we didnt have status.time so i think this fixes the problem(?)
      // maybe we need a timeout function here to run around out $apply()??
      //  $scope.$apply();
        //need to find out what the member/who is
        //$scope.getTaskHistory(member);

	    }


	};


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


	$scope.openUp = function(string){
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
	}

	$scope.getCurrentTeam = function(){
		new Firebase(FURL).child('profile').child(Auth.user.uid).once('value', function(user) {
			user = user.val();
      $scope.currentUser = user;
			//console.log(user);
			if(user.curTeam){
				Auth.team = user.curTeam;
				$scope.team = user.curTeam;
				$scope.checkStatus();
				$scope.getUserTask();
			}else{
				$location.path("/switchteam");
			}
		});
	};

	$scope.getSelectedTask = function(member){
		if(!$scope.teamExpander.full){
			$scope.openUp('full');
		}
		$scope.selected = member;
		$scope.taskHistory = [];//reset task history
		$scope.getTaskHistory(member);
	};

	//Make task history

    $scope.getTaskHistory = function(member){
    	console.log(member);
      var startTime = new Date().getTime();
      var endTime = startTime - 86400000;
      console.log(startTime);


      new Firebase(FURL).child('team').child($scope.team).child('all').child(member.uid).orderByChild('time').startAt(endTime).once('value',function(data){
        data = data.val();
        console.log(data);

        var keys = Object.keys(data);
        var arr = [];
        for(var i = 0; i < keys.length;i++){
          arr.push(data[keys[i]]);
        }
        $scope.taskHistory = arr;
        //$scope.$apply();


      });
    };

    $scope.getUserTask = function(){
    	new Firebase(FURL).child('team').child($scope.team).child('task').child(Auth.user.uid).once('value', function(data) {
    		data = data.val();
    		if(data){
    			$scope.task = data.name;
    			$scope.taskTime = data.time;
          //$scope.$apply();
    			//$scope.showTaskView = true;
    		}

    	});
    }


	$scope.checkStatus = function(){
   	 var team = $scope.team;
     new Firebase(FURL).child('team').child(team).child('task').on('value', function(users) {
     $scope.teamMembers = [];
       users = users.val();
       //console.log(users);
       if(users){
         var teamUID = Object.keys(users);

            for (var i = 0; i < teamUID.length; i++) {
                getTeamMember(teamUID[i], users);
            }

            //console.log($scope.teamMembers);
            //$scope.$apply();
       }

     });
   };

   function getTeamMember(memberID, users){

       var userrefs = new Firebase(FURL + 'profile/' + memberID);
       userrefs.once("value", function(data) {
               //console.log(memberID);
               var p = data.val();
               //console.log(p);
               var pic,style;
               if(users[memberID].photo){
                style = "background:url("+users[memberID].photo+") no-repeat center center fixed; -webkit-background-size: cover;-moz-background-size: cover; -o-background-size: cover; background-size: cover";
              }else{
                style = false;
              }
               var teamMember = {
                   name : p.name,
                   gravatar : p.gravatar,
                   task : users[memberID].name,
                   time : users[memberID].time,
                   weather:users[memberID].weather,
                   city:users[memberID].city,
                   uid : memberID,
                   photo:style
               };
               //Team.addMember(teamMember);
               $scope.teamMembers.push(teamMember);
               //$scope.$apply();

           });
   }

   // Add member

   $scope.addMemberModal = function(){
   	$('#myModal').modal('toggle');
   };

  // var ref = new Firebase(FURL);
  // ref.child('profile').child(Auth.user.uid).once('value',function(data){
  //   user = data.val();
  //   msg = {
  //     "template_name" : 'invite',
  //     "template_content": [

  //         {
  //           "name":'team_name',
  //           "content":Auth.team
  //         },
  //         {
  //           "name":'inviter_name',
  //           "content":user.name
  //         },
  //         {
  //           "name":'inviter_email',
  //           "content":user.email
  //         }

  //     ],
  //     "message" : {
  //       "from_email" : 'brian@phased.io',
  //       "from_name" : "Brian",
  //       'subject' : user.name+" has invited you to " + Auth.team,
  //       'global_merge_vars' : [
  //         {
  //           "name":'team_name',
  //           "content":Auth.team
  //         },
  //         {
  //           "name":'inviter_name',
  //           "content":user.name
  //         },
  //         {
  //           "name":'inviter_email',
  //           "content":user.email
  //         }
  //       ],
  //       'to' : [
  //         {
  //           'email' : names.email
  //         }
  //       ]
  //     }
  //   };
  // });



  // console.log(user);


  $scope.addMembers = function(names){
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

          //push new team to member
          ref.child('profile').child(selectedUID[y]).child('teams').push(Auth.team);
          break;
        }
      }
      // if no matches are found create a profile-in-waiting with this team assigned.
      if(!isSet){
        console.log(names.email);
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
            ref.child('profile-in-waiting').push({teams : { 0 : Auth.team},email : names.email});


            //sendTheMail(msg);
          }
        });
      }
    });
	$('#myModal').modal('toggle');

  };


  //Send Mandrill Email

    // Create a function to log the response from the Mandrill API
    // function sendTheMail(p) {
    //         var m = new mandrill.Mandrill('B0N7XKd4RDy6Q7nWP2eFAA');
    //         // Send the email!
    //         console.log('Sending mails');
    //         m.messages.sendTemplate(p, function(res) {
    //             log(res);
    //         }, function(err) {
    //             log(err);
    //         });
    //     };
    // //Mandrill responce handler
    // function log(obj) {
    //     console.log('Handling response');
    //     console.log(obj);
    //     //$('#response').text(JSON.stringify(obj));
    // };


   //Settings page

   $scope.logout = function(){
   	Auth.logout();
   	$location.path('/login');
   };
   $scope.switchTeam = function(){
   	$location.path('/switchteam');
   };

   $scope.showSettings = function(){
   	$scope.showsetting = true;
   };

   $scope.hideSetting = function(){
   	//$scope.showsetting = false;
   };



  // Change ImageCode
  //create the crypto shit (could be in a different file?)

  var ref = new Firebase(FURL);

  //console.log(Auth.user);
  document.getElementById("file-upload").addEventListener('change', handleFileSelect, false);
  function handleFileSelect(evt) {
    var f = evt.target.files[0];
    var reader = new FileReader();
    reader.onload = (function(theFile) {
      return function(e) {
        var gravatar = e.target.result;
        // Generate a location that can't be guessed using the file's contents and a random number
        //var hash = CryptoJS.SHA256(Math.random() + CryptoJS.SHA256(gravatar));
        var f = new Firebase(ref.child("profile").child(Auth.user.uid) + '/gravatar');
        f.set(gravatar, function() {
          document.getElementById("pano").src = e.target.result;
          $('#file-upload').hide();

          // Update the location bar so the URL can be shared with others
          //window.location.hash = hash;

        });
      };
    })(f);
    reader.readAsDataURL(f);
  }



  $scope.changeImage = function(){
    $('#pano').hide();

    new Firebase(FURL).child('profile').child(Auth.user.uid).once('value', function(user) {
      user = user.val();
      $scope.currentUser = user;
      console.log($scope.currentUser);
    });

      //$scope.$apply();
    setTimeout(function () {
      $scope.$apply();
    }, 1000);

    }

  $scope.saveChanges = function(){
    console.log('will save changes to form');
    //should add a toaster that confirms that changes were saved?
  }
   $scope.getCurrentTeam();

  // Update Account
  $scope.updateUser = function(update){
    if(update.email === undefined || update.email === ''){
      update.email = $scope.currentUser.email;
    }

    if(update.name === $scope.currentUser.name || update.name === undefined || update.name === ''){
      //console.log("we are changing the password");
      if(update.oldPass && update.newPass){
        console.log('we will change the password');
        Auth.changePassword(update).then(function (){
          console.log('will change password');
          toaster.pop('success', "Your password has been changed!");
        }, function(err) {
          console.log('error', err);
          if (err == "Error: The specified password is incorrect.") {
            console.log("we are here");
            toaster.pop('error', 'Your current password is incorrect');
          } else {
            toaster.pop('error', 'Your email is incorrect! Make sure you are using your current email');
          }

        });
      } else {
        console.log('changing email');
        console.log(update.email);
        if (update.email !== $scope.currentUser.email) {
          console.log('we are changing the email', Auth.user.uid);
          Auth.changeEmail(update, Auth.user.uid);
          toaster.pop('success', "Your email has been updated!");
        }
      }
    }else {
      console.log('changing userName or email');
      console.log(update.email);
      if (update.name !== $scope.currentUser.name) {
        Auth.changeName(update, Auth.user.uid);

        new Firebase(FURL).child('profile').child(Auth.user.uid).once('value', function(user) {
          user = user.val();

          console.log(user);
          console.log(Auth.user.uid);
        });

        toaster.pop('success', "Your name has been updated!");
      }
      if (update.email !== $scope.currentUser.email) {
        Auth.changeEmail(update, Auth.user.uid);
        toaster.pop('success', "Your email has been updated!");
      }
    }
  };

//Switch team logic

  $scope.userTeams = [];
  console.log($scope.currentUser);


  $scope.getTeams = function(){
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
          $scope.$apply();

        }

      }
    });
  };

  //$scope.switchTeam = function(teamName){
  //  new Firebase(FURL).child('profile').child(Auth.user.uid).child('curTeam').set(teamName,function(){
  //    $location.path('/')
  //  })
  //}

  $scope.newTeam = function(){
    $location.path('/createteam');
  };

  function getTeamNumber(team){
    new Firebase(FURL).child('team').child(team).child('members').once('value', function(members){
      members = members.val();
      members = Object.keys(members);
      return members.length;

    });
  };

  $scope.getTeams();


});
