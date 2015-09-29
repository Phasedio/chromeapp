app.controller('MainInteractionController',function($scope){
	$scope.showTaskView = false;
	$scope.task = '';

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
	
});