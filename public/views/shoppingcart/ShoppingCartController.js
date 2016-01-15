'use strict'

angular.module('acme_supermarket').registerCtrl('ShoppingCartCtrl', ['$scope', '$http', '$cookies', '$cookieStore', '$window', function ($scope, $http, $cookies, $cookieStore, $window) {
	
	var cookie = $cookies.get("shoppingcart");
	$scope.shoppingcart = [];
	if (cookie) {
		cookie = JSON.parse(cookie);
		if (!$.isEmptyObject(cookie)) {
			Object.keys(cookie).forEach(function(id) {
				$http({
					method: 'GET',
					url: '/api/product/' + id
				}).
				then(function success(response) {
					var product = response.data;
					product['quantity'] = cookie[id];
					$scope.shoppingcart.push(product);
				}, function error(response) {
				});
			});

		}
	}

	$scope.productsInCart = function() {
		var r = 0;
		var cookie = $cookies.get("shoppingcart");
		if (cookie) {
			cookie = JSON.parse(cookie);
			if (!$.isEmptyObject(cookie)) {
				for (var id in cookie) {
					if (cookie.hasOwnProperty(id)) {
						r += cookie[id];
					}
				}
			}
		}
		return r;
	}

	$scope.hasEmptyCart = function () {
		return $scope.productsInCart()===0;
	}

	$scope.add = function(product) {
		product.quantity = Math.min(product.quantity + 1, 999);
		var id = product._id;
		// Updates in table
		var index = -1;		
		var products = eval( $scope.shoppingcart );
		for( var i = 0; i < products.length; i++ ) {
			if( products[i].id === id ) {
				products[i].quantity = products[i].quantity + 1
			}
		}
		// Updates in cookie
		var cookie = $cookies.get("shoppingcart");
		var new_cookie = {};
		if (cookie) {
			cookie = JSON.parse(cookie);
			new_cookie = cookie;
			if (!$.isEmptyObject(cookie)) {
				if (new_cookie[id]) {
					new_cookie[id] = Math.min(cookie[id] + 1, 999);
				}
			}
		$cookieStore.put("shoppingcart", new_cookie);
		}
	}

	$scope.substract = function(product) {
		product.quantity = Math.max(product.quantity - 1, 1);
		var id=product._id;
		// Updates in table
		var index = -1;		
		var products = eval( $scope.shoppingcart );
		for( var i = 0; i < products.length; i++ ) {
			if( products[i].id === id ) {
				products[i].quantity = products[i].quantity - 1
			}
		}
		// Updates in cookie
		var cookie = $cookies.get("shoppingcart");
		var new_cookie = {};
		if (cookie) {
			cookie = JSON.parse(cookie);
			new_cookie = cookie;
			if (!$.isEmptyObject(cookie)) {
				if (new_cookie[id]) {
					new_cookie[id] = Math.max(cookie[id] - 1, 1);
				}
			}
		$cookieStore.put("shoppingcart", new_cookie);
		}
	}


	$scope.remove = function (product_id) {
		var cookie = $cookies.get("shoppingcart");
		if (cookie) {
			cookie = JSON.parse(cookie);
			if (!$.isEmptyObject(cookie)) {
				for (var id in cookie) {
					if (cookie.hasOwnProperty(id)) {
						if (id===product_id)
							delete cookie[id];
					}
				}
			}
		}
		for (var i = 0; i<$scope.shoppingcart.length; i++) {
			if ($scope.shoppingcart[i]._id === product_id) {
				$scope.shoppingcart.splice(i, 1);
			}
		}
		$cookieStore.put("shoppingcart", cookie);
	}

	$scope.return = function() {
		$window.history.back();
	}
}]);