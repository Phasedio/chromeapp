app.controller('SwitchTeamController',function($scope,FURL,Auth,Phased,$http,$location,ngDialog){
	$scope.currentUser = Phased.user;

	function newUserCheck(){
		new Firebase(FURL).child('profile').child(Auth.user.uid).child('newUser').once('value', function(data){
			data = data.val();
			if(data == true){
				ngDialog.open({
			      template: 'views/partials/onboard.html',
			      className: 'ngdialog-theme-plain',
			      scope: $scope
			    });
			}else{

			}
		})
	}

	$scope.switchTeam = function(teamName) {
		Phased.switchTeam(teamName, function callback() {
			$location.path('/');
		})
	}

	$scope.newTeam = function(){
		$location.path('/createteam');
	}


	$scope.closeAll = function(){
    	ngDialog.close();
    }
    $scope.next = function(){
    	ngDialog.close();
    }
	newUserCheck();

});
