app.controller('SwitchTeamController',function($scope,FURL,Auth,$http,$location){
	$scope.userTeams = [];
	

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
	}

	$scope.switchTeam = function(teamName){
		new Firebase(FURL).child('profile').child(Auth.user.uid).child('curTeam').set(teamName,function(){
			$location.path('/')
		})
	}

	$scope.newTeam = function(){
		$location.path('/createteam');
	}

	function getTeamNumber(team){
		new Firebase(FURL).child('team').child(team).child('members').once('value', function(members){
			members = members.val();
			members = Object.keys(members);
			return members.length;
			
		});
	};

	$scope.getTeams();

});