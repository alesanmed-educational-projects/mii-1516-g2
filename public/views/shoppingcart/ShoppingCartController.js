'use strict'

angular.module('acme_supermarket').registerCtrl('ShoppingCartCtrl', ['$scope', '$http', function ($scope, $http) {
	$http({
		method: 'GET',
		url: '/api/products'
	}).
	then(function success(response) {
		$scope.products = response.data;
	}, function error(response) {
	});
}]);