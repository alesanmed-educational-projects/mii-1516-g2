var db_utils = require('./db_utils'),
	Provide = require('../models/provide'),
	SupplierService = require('./services/service_suppliers'),
	ReputationService = require('./services/service_reputation'),
	ActorService = require('./services/service_actors')
	async = require('async');

// Devuelve una lista de Provides que tienen un producto con id
exports.getProvidesByProductId = function(req, res) {
	var _code = req.params.id;

	console.log('GET /api/providesByProductId/'+_code)
	var cookie = req.cookies.session;
	var jwtKey = req.app.get('superSecret')
	// Check authenticated
	ActorService.getUserRole(cookie, jwtKey, function (role) {
		if (role=='admin' || role=='customer' | role=='supplier') {
			// Get product's provides
			Provide.find({product_id: _code},function (err,provides){
				if(err){
					console.log('---ERROR finding Provides with  product_id: '+_code+' message: '+err);
					res.status(500).json({success: false, message: err});
				}else{
					var final_provides = [];
					// For each provide
					async.each(provides, function (provide, callback) {
						var provide_obj = provide.toObject();
						//Get and store the supplier name
						SupplierService.getName(provide.supplier_id, function (err, supplier) {
							if(err) {
								console.log(err);
								res.sendStatus(500);
							} else {
								provide_obj['supplierName'] = supplier.name;
								//Get and store the supplier average reputation
								ReputationService.averageReputation(supplier.id, function (err, results) {
									if(err){
										console.log(err);
										res.sendStatus(500);
									}

									provide_obj['reputation'] = Math.floor(results[0].avg);
									SupplierService.userHasPurchased(cookie, jwtKey, provide.id, function (hasPurchased) {
										provide_obj['userHasPurchased'] = hasPurchased;
										
										final_provides.push(provide_obj);
										callback();
									});
								});
							}
						});
					}, function (err) {
						if(err){
							console.log(err);
							res.sendStatus(500);
						}

						res.status(200).json(final_provides);
					});
				}
			});
		} else {
			res.sendStatus(401);
		}
	});
};

// Returns a supplier object of supplier for product identified by id
exports.getSupplierProvidesByProductId = function(req, res) {
	var _code = req.params.id;
	console.log('GET /api/provide/bysupplier/byproduct/'+_code)

	var cookie = req.cookies.session;
	var jwtKey = req.app.get('superSecret');
	// Check authenticated
	ActorService.getUserRole(cookie, jwtKey, function (role) {
		if (role=='admin' || role=='customer' || role=='supplier') {
			SupplierService.getPrincipalSupplier(cookie, jwtKey, function (supplier) {
				if (supplier) {

					Provide.find({product_id: _code, supplier_id: supplier._id}, function(err,provide){
						if(err){
							// Internal Server Error
							res.status(500).json({success: false, message: err});
						}else{
							//console.log(provide);
							res.status(200).json(provide);
						}
					});

				} else {
					// Principal supplier not found in DB
					res.status(403).json({success: false, message: "Doesn't have permissions"});
				}
			});
		} else {
			// Not authenticated
			res.status(401).json({success: false, message: "Not authenticated"});
		}
	});
}

// Deletes a supplier object of supplier for product identified by id
exports.deleteSupplierProvidesByProductId = function(req, res) {
	var _code = req.params.id;
	console.log('GET /api/provide/bysupplier/byproduct/'+_code)

	var cookie = req.cookies.session;
	var jwtKey = req.app.get('superSecret');
	// Check authenticated
	ActorService.getUserRole(cookie, jwtKey, function (role) {
		if (role=='admin' || role=='customer' || role=='supplier') {
			SupplierService.getPrincipalSupplier(cookie, jwtKey, function (supplier) {
				if (supplier) {

					Provide.remove({product_id: _code, supplier_id: supplier._id}, function(err){
						if(err){
							// Internal Server Error
							res.status(500).json({success: false, message: err});
						}else{
							//console.log(provide);
							res.status(200).json({success: true});
						}
					});
					
				} else {
					// Principal supplier not found in DB
					res.status(403).json({success: false, message: "Doesn't have permissions"});
				}
			});
		} else {
			// Not authenticated
			res.status(401).json({success: false, message: "Not authenticated"});
		}
	});
}

// returns a provide identified by id
exports.getProvide = function(req, res) {
	var _code = req.params.id;
	console.log('GET /api/provide/'+_code)

	var cookie = req.cookies.session;
	var jwtKey = req.app.get('superSecret');
	// Check authenticated
	ActorService.getUserRole(cookie, jwtKey, function (role) {
		if (role=='admin' || role=='customer' || role=='supplier') {
			Provide.findById( _code,function(err,provide){
				if(err){
					console.log('---ERROR finding Provide: '+_code+' message: '+err);
					res.status(500).json({success: false, message: err});
				}else{
					//console.log(provide);
					res.status(200).json(provide);
				}
			});
		} else {
			res.status(401).json({success: false, message: "Not authenticated"});
		}
	});
};