app.controller('CreateTeamController',function($scope,FURL,Auth,$http,$location){
	var ref = new Firebase(FURL);

	$scope.createTeam = function(team){
		console.log('MAKING A NEW TEAM');
        var teamRef = ref.child('team');
        teamRef.child(team).once('value', function(snapshot){
          //if exists
          if(snapshot.val() == null){
            
            teamRef.child(team).child('members').child(Auth.user.uid).set(true,function(){
            	ref.child('profile').child(Auth.user.uid).child('teams').push(team,function(){
            		ref.child('profile').child(Auth.user.uid).child('curTeam').set(team,function(){
            			console.log('sending');
            			$location.path('/');
            			$scope.$apply();
            		})
            	});
            });
            
            
            
            
          }else{

            alert('Team name taken!');
          }
        });
	};

	$scope.goBack = function(){
		$location.path('/switchteam');
	}
});