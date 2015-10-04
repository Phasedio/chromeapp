app.controller('MainInteractionController',function($scope,FURL,Auth,$http,$location){
	$scope.showTaskView = false;
	$scope.task = '';
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
		    teamRef.child('team').child(team).child('task').child(Auth.user.uid).set(status);
		    teamRef.child('team').child(team).child('all').child(Auth.user.uid).push(status,function(){
		      console.log('status set');
		      $scope.updateStatus = '';

		      //Send push notifications to team
		      $http.get('http://45.55.200.34:8080/push/update/'+team+'/'+Auth.user.name+'/'+status.name,'').success(function(data){
		        //alert(data);
		      });
		      
		    });
		    $scope.task = update;
			$scope.showTaskView = true;

	    }
	    
	}

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
			}
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
			console.log(user);
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
		$scope.taskHistory = [];//reset task histroy
		$scope.getTaskHistory(member);
	}

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
        $scope.$apply();


      });
    };

    $scope.getUserTask = function(){
    	new Firebase(FURL).child('team').child($scope.team).child('task').child(Auth.user.uid).once('value', function(data) {
    		data = data.val();
    		if(data){
    			$scope.task = data.name;
    			$scope.taskTime = data.time;
    			//$scope.showTaskView = true;
    		}
    		
    	});
    }


	$scope.checkStatus = function(){
   	 var team = $scope.team;
     new Firebase(FURL).child('team').child(team).child('task').on('value', function(users) {
     $scope.teamMembers = [];
       users = users.val();
       console.log(users);
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
               console.log(p);
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
               $scope.$apply();
   
           });
   }

   // Add member

   $scope.addMemberModal = function(){
   	$('#myModal').modal('toggle');
   }

  //  var ref = new Firebase(FURL);
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

  }


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
   }
   $scope.switchTeam = function(){
   	$location.path('/switchteam');
   }

   $scope.showSettings = function(){
   	$scope.showsetting = true;
   }
   $scope.hideSetting = function(){
   	$scope.showsetting = false;
   }

   $scope.getCurrentTeam();
   
});