app.controller('MainInteractionController',function($scope,FURL,Auth){
	$scope.showTaskView = false;
	$scope.task = '';
	$scope.team = '';

	$scope.teamExpander = {
		expand : false,
		full : false
	}
	

	$scope.addTask = function(task){
		console.log(task);
		$scope.task = task;
		$scope.showTaskView = true;
	}

	$scope.openUp = function(string){
		if($scope.teamExpander[string]){
			$scope.teamExpander = {
				expand : false,
				full : false
			}
		}else{
			$scope.teamExpander[string] = true;
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
			}
		});
	};

	



	$scope.checkStatus = function(){
   	 var team = $scope.team;
     new Firebase(FURL).child('team').child(team).child('task').on('value', function(users) {
       users = users.val();
       console.log(users);
       if(users){
         var teamUID = Object.keys(users);
   
            for (var i = 0; i < teamUID.length; i++) {
                getTeamMember(teamUID[i], users);
            }
            $scope.teamMembers = Team.members;
            console.log($scope.teamMembers);
            $scope.$apply();
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
               $scope.$apply();
   
           });
   }
   $scope.getCurrentTeam();
   
});