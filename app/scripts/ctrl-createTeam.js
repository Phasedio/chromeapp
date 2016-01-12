app.controller('CreateTeamController',function($scope,FURL,Auth,Phased,$http,$location){
	var ref = new Firebase(FURL);

	$scope.createTeam = function(team){
		console.log('MAKING A NEW TEAM');

    Phased.addTeam(team, 
      function success() {
        $location.path('/');
        $scope.$apply();
      },
      function failure() {
        alert('Team name taken!');
      });
	};

	$scope.goBack = function(){
		$location.path('/switchteam');
	}
});