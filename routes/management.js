var db_utils = require('./db_utils'),
	Actor = require('../models/actor'),
	Admin = require('../models/admin'),
	Customer = require('../models/customer'),
	Supplier = require('../models/supplier'),
	Product = require('../models/product'),
	Credit_card = require('../models/credit_card'),
	Category = require('../models/category'),
	Belongs_to = require('../models/belongs_to'),
	Provide = require('../models/provide'),
	Purchase = require('../models/purchase'),
	PurchaseLine = require('../models/purchase_line'),
	Rate = require('../models/rate'),
	Reputation = require('../models/reputation'),
	Discount = require('../models/discount'),
	IsOver = require('../models/is_over'),
	PurchasingRule = require('../models/purchasing_rule'),
	ProductRule = require('../models/product_rule'),
	BrandRule = require('../models/brand_rule'),
	ProductNotification = require('../models/product_notification'),
	BrandNotification = require('../models/brand_notification'),
	crypto = require('crypto'),//Necesario para encriptacion por MD,
	mongoose = require('mongoose'),
	fs = require('fs'),
	async = require('async'),
	generator = require('creditcard-generator'),
	ProductService = require('./services/service_products'),
	PurchaseService = require('./services/service_purchase'),
	shuffle = require('shuffle-array'),
	sync = require('synchronize'),
	CouponCode = require('coupon-code');


function random(max, min) {
	return Math.floor(Math.random()*(max-min+1)+min);
}

function randomDate(start, end) {
	return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomCoords() {
	points = [[37.412164190504484, -6.005916595458984],
			  [37.412164190504484, -5.909099578857422],
			  [37.33931889054622, -5.909099578857422],
			  [37.33931889054622, -6.005916595458984]]

	latitude_max = points[0][0]
	latitude_min =  points[3][0]
	longitude_max = points[0][1]
	longitude_min = points[3][1]

	latitude = Math.random()*(latitude_max-latitude_min)+latitude_min;
	longitude = Math.random()*(longitude_max-longitude_min)+longitude_min;

	return [latitude, longitude]
}

// Restore Mongo DB to development state
function startProcess(callback) {
	loadCategories(callback);
}

function loadCategories (callback) {
	var categories_f = fs.readFileSync('big_db/categories.json', 'UTF-8');
	var categories = JSON.parse(categories_f);
	
	var categories_mapping = {};

	async.each(categories.categories, function (category, category_callback) {
		var new_category = new Category({
			name : category.name || "No Category"
		});

		new_category.save(function (err, saved) {
			if(err) console.log("--ERR: Error saving category: " + err);

			categories_mapping[parseInt(category.id)] = parseInt(saved.id);
			category_callback();
		});
	}, function (err) {
		if(err) console.log("--ERR: Error saving all categories: " + err);

		fs.writeFileSync('big_db/categories_mapping.json', JSON.stringify(categories_mapping));
		console.log("--DO: Categories saved");

		loadProducts(callback);
	});
}

function stringGen(len) {
	var text = "";
	var charset = "0123456789";
	for( var i=0; i < len; i++ )
		text += charset.charAt(Math.floor(Math.random() * charset.length));
	return text;
}

function ean13_checksum(message) {
    var checksum = 0;
    message = message.split('').reverse();
    for(var pos in message){
        checksum += message[pos] * (3 - 2 * (pos % 2));
    }
    return ((10 - (checksum % 10 )) % 10);
}

function randomEAN13(){
	var p1 = stringGen(12)
	var p2 = ean13_checksum(p1).toString()
	return p1 + p2
}

function loadProducts(callback) {
	var products_f = fs.readFileSync('big_db/products.json', 'UTF-8');
	var products = JSON.parse(products_f);

	var products_mapping = {};

	var barcodes_test = ["4035873029458", "7613033114397", "4260209940101", "8714789733173", "9437000435655", "8480000444080",
	"5600445303978", "8410014837578", "4001954302147", "8480000773289", "7613034333650", "4010355105370",
	"8413700405815", "8470006792902", "3073781042238", "4031741420037", "8480000107206", "2000591007820",
	"8410637112014", "8480000171122", "8480000467034", "8480000808592", "8410213257504", "8480000460226",
	"8431364131024", "3228021000145", "8480000430069", "5000488104165", "8000270018257", "4019300160556",
	"8480000785077", "8410302106300", "8410086315028", "8470006792902", "8410091026896", "4039361053604",
	"9788494288142", "8480000101990", "8411959101007", "8412478247689", "5411188116592", "4010355125927",
	"8428899005135", "8420640601122", "4000980647819", "4311501358405", "8480000171535", "8480000180551",
	"4903460067681"]
	var barcodes_registered = [];

	async.each(products.products, function (product, products_callback) {
		try {

			if (barcodes_test.length>0) {
				barcode = barcodes_test[0]
				barcodes_test.splice(0, 1);
			} else {
				barcode = randomEAN13()
			}
			while(barcodes_registered.indexOf(barcode) >= 0) {
				if (barcodes_test.length>0) {
					barcode = barcodes_test[0]
					barcodes_test.splice(0, 1);
				} else {
					barcode = randomEAN13()
				}
			}

			barcodes_registered.push(barcode);

			fs.accessSync('public/img/'+product.image, fs.F_OK);
			// Exists, save product
				var new_product = new Product({
				"code" : barcode,
				"name" : product.name,
				"description" : product.description || "-",
				"image" : product.image,
				"avgRating" : 0
			});

			new_product.save(function (err, prod) {
				if (err) console.log("--ERR: Error saving product: " + err);

				products_mapping[product._id] = parseInt(prod.id);
				products_callback();
			});
		} catch (e) {
			// Not exists or not accessible, skip
			products_callback();
		}
	}, function (err) {
		if (err) console.log("--ERR: Error saving all products: " + err);

		fs.writeFileSync('big_db/products_mapping.json', JSON.stringify(products_mapping));
		console.log("--DO: Products saved");

		loadDiscounts(callback);
	});
}

function loadDiscounts(callback) {
	sync.fiber(
		function() {
			var products = sync.await(Product.find({}, sync.defer()));

			var fixed_product = sync.await(Product.findById(1, sync.defer()));

			var discount = new Discount({
				code : 'W5PQ-PYN2-B8B4-6H8J',
				value : 30
			});

			var saved = sync.await(discount.save(sync.defer()));

			var isOver = new IsOver({
				product_id: fixed_product.id,
				discount_id : saved.id
			});

			sync.await(isOver.save(sync.defer()));

			for(var i = 0; i < 30; i++) {
				var rand_products = shuffle(products);
				var nr_products = random(30, 40);
				var affected_products = rand_products.slice(0, nr_products);

				discount = new Discount({
					code: CouponCode.generate({ parts: 4 }),
					value : random(10, 60)
				});

				saved = sync.await(discount.save(sync.defer()));

				for(var j = 0; j < affected_products.length; j++) {
					isOver = new IsOver({
						product_id: affected_products[j].id,
						discount_id: saved.id
					});

					sync.await(isOver.save(sync.defer()));
				}
			} 
	
		},
		function (err, data) {
			if(err) console.log('--ERR: Error saving discounts: ' + err);

			console.log("--DO: Saved all discounts");

			loadBelongsTo(callback);
		}
	);
}

function loadBelongsTo(callback) {
	var belongs_to_f = fs.readFileSync('big_db/belongs_to.json', 'UTF-8');
	var belongs_to = JSON.parse(belongs_to_f);

	var categories_mapping = JSON.parse(fs.readFileSync('big_db/categories_mapping.json', 'UTF-8'));
	var products_mapping = JSON.parse(fs.readFileSync('big_db/products_mapping.json', 'UTF-8'));

	async.each(belongs_to.belongs_to, function (belongs, belongs_to_callback) {
		var product_id = products_mapping[belongs.product_id];
		
		if(product_id != undefined) {
			var new_belongs_to = new Belongs_to({
				"product_id" : parseInt(product_id),
				"category_id" : parseInt(categories_mapping[belongs.category_id])
			});

			new_belongs_to.save(function (err) {
				if (err){
					console.log("--ERR: Error saving belongs to: " + err + " for belongs_to " + belongs.product_id);
				}

				belongs_to_callback();
			});
		} else {
			belongs_to_callback();
		}

	}, function (err) {
		if (err) console.log("--ERR: Error saving all belongs_to: " + err);

		console.log("--DO: Belongs to saved");

		loadAdmins(callback);
	});
}

function loadAdmins(callback) {
	var admins_f = fs.readFileSync('big_db/admins.json', 'UTF-8');
	
	var admins = JSON.parse(admins_f);

	async.each(admins.admins, function (admin, callback) {
		var admin1 = new Admin({
			"_type" : admin._type,
			"name" : admin.name,
			"surname" : admin.surname,
			"email" : admin.email,
			"password" : admin.password
		});

		admin1.save(function (err) {
			if (err) console.log("--ERR: Error saving admin: " + err);

			callback();
		})
	}, function (err) {
		if(err) console.log("--ERR: Error saving all admins: " + err);

		loadCustomers(callback);
	});
}

function loadCustomers(callback) {
	var customers_f = fs.readFileSync('big_db/customers.json', 'UTF-8');

	var customers = JSON.parse(customers_f);

	async.each(customers.customers, function (customer, callback){
		var credit_card = new Credit_card({
			"holderName" : customer.name + " " + customer.surname,
			"number" : generator.GenCC("VISA")[0],
			"expirationMonth" : 06,
			"expirationYear" : 2020,
			"cvcCode" : 224
		});

		credit_card.save( function (err, card) {
			if(err) console.log("--ERR: Error saving credit card: " + err);

			var coordinates = randomCoords()
			var customer1 = new Customer({
				"_type" : customer._type,
				"name" : customer.name,
				"surname" : customer.surname,
				"email" : customer.email,
				"password" : customer.password, //customer
				"coordinates" : coordinates[0] + ";" + coordinates[1],
				"address" : customer.address,
				"country" : customer.country,
				"city" : customer.city,
				"phone" : customer.phone,
				"timeWindow" : customer.timeWindow,
				"credit_card_id" : card.id
			});

			customer1.save(function (err, saved) {
				if (err) console.log("--ERR: Error saving customer: " + err);

				callback();
			});
		});
	}, function (err) {
		if (err) console.log("--ERR: Error saving all customers: " + err);

		console.log("--DO: Customers saved");

		loadSuppliers(callback);
	});
}

function loadSuppliers(callback) {
	var suppliers_f = fs.readFileSync('big_db/suppliers.json', 'UTF-8');

	var suppliers = JSON.parse(suppliers_f);

	async.each(suppliers.suppliers, function (supplier, callback){
		var supplier1 = new Supplier({
			"_type" : supplier._type,
			"name" : supplier.name,
			"surname" : supplier.surname,
			"email" : supplier.email,
			"password" : supplier.password, //supplier
			"coordinates" : supplier.coordinates,
			"address" : supplier.address
		});

		supplier1.save(function (err) {
			if (err) console.log("--ERR: Error saving supplier: " + err);

			callback();
		});
	}, function (err) {
		if (err) console.log("--ERR: Error saving all suppliers: " + err);

		console.log("--DO: Suppliers saved");

		loadPurchases(callback);
	});
}

function loadPurchases(callback) {
	sync.fiber(function () {
		var dates = [];
		var now = new Date();

		for(var i=0; i<200; i++) {
			dates.push(randomDate(new Date(now.getFullYear() - 3, 0, 1, 0, 0, 0, 0), now));
		}

		var customers = sync.await(Actor.find({ "_type" : "Customer"}, sync.defer()));

		var products = sync.await(Product.find({}, sync.defer()));
		var shuffled_products = shuffle(products);
		shuffled_products = shuffled_products.slice(0, 400);
		
		for (var i = 0; i < customers.length; i++){
			console.log(i + "/" + customers.length)
			var customer = customers[i];

			var max_purchases = 50;
			var min_purchases = 150;

			var nr_purchases = random(max_purchases, min_purchases);
			
			for(var j = 0; j < nr_purchases; j++) {
				sync.await(makePurchase(shuffled_products, customer.id, dates, sync.defer()));
			}
		}

	}, function (err, data) {
		if(err) console.log("--ERR: Error purchasing all products: " + err);

		console.log("--DO: Purchased all products");

		loadPurchasingRules(callback);
	});
}

function loadPurchasingRules(callback) {
	sync.fiber(function () {
		var customers = sync.await(Customer.find({"_type" : "Customer"}, sync.defer()));

		var provides = sync.await(Provide.find({}, sync.defer()));

		for(var i = 0; i < customers.length; i++) {
			var rules_nr = random(1, 5);

			for(var j = 0; j < rules_nr; j++) {
				var quantity = random(1, 4);
				var provide_to_buy = provides[random(0, provides.length)];

				var purchasingRule = new PurchasingRule({
					periodicity: random(4, 10),
					customer_id: customers[i].id,
					provide_id : provide_to_buy.id
				});

				sync.await(purchasingRule.save(sync.defer()));
			}
		}
	}, function (err, data) {
		if(err) console.log("--ERR: Error saving purchasing rules: " + err);

		console.log("--DO: Saved all purchasing rules");

		loadSocialMediaRules(callback);
	});
}

function loadSocialMediaRules(callback) {
	sync.fiber(function () {
		var products = sync.await(Product.find({}, sync.defer()));
		var rules_nr = 10;

		for(var j = 0; j < rules_nr; j++) {
			var product_to_watch = products[random(0, products.length)];

			var productRule = new ProductRule({
				increaseRate: 30,
				product_id: product_to_watch.id
			});

			sync.await(productRule.save(sync.defer()));
		}

		var brandRule = new BrandRule({
			increaseRate: 20
		});

		sync.await(brandRule.save(sync.defer()));
	}, function (err, data) {
		if(err) console.log("--ERR: Error saving social media rules: " + err);

		console.log("--DO: Saved all social media rules");

		loadSocialMediaRulesNotifications(callback);
	});
}

function loadSocialMediaRulesNotifications(callback) {
	sync.fiber(function() {
		var productRules = sync.await(ProductRule.find({_type: 'ProductRule'}, sync.defer()));

		var chosenProductRules = shuffle(productRules).slice(0, random(1, productRules.length - 3)); //Not all with notifications nor all without notifications

		for(var i = 0; i < chosenProductRules.length; i++) {
			var productNotification = new ProductNotification({
				percentageExceeded: 40,
				product_rule_id: chosenProductRules[i].id,
				product_id: chosenProductRules[i].product_id
			});

			sync.await(productNotification.save(sync.defer()));
		}

		var brandRules = sync.await(BrandRule.find({}, sync.defer()));

		var chosenBrandRules = brandRules[0];

		var brandNotification = new BrandNotification({
			percentageExceeded: 20,
			brand_rule_id: chosenBrandRules.id
		});

		sync.await(brandNotification.save(sync.defer()));

	}, function (err, data) {
		if(err) console.log("--ERR: Error saving social media notifications: " + err);

		console.log("--DO: Saved all social media notifications");

		loadExtraProvides(callback);
	});
}

function loadExtraProvides(callback) {
	sync.fiber(function () {
		var provided_products = sync.await(Provide.find({}).select({ "product_id" : 1}).exec(sync.defer()));

		var provided_products_ids = provided_products.map(function (product) {
			return product.id;
		});

		var not_provided_products = sync.await(Product.find({"_id" : {"$nin" : provided_products_ids }}, sync.defer()));
		var not_provided_products_ids = not_provided_products.map(function (product) {
			return product.id;
		});

		var not_provided_products_ids = shuffle(not_provided_products_ids);
		var products_nr = random(Math.floor(not_provided_products_ids.length * 0.7), not_provided_products_ids.length);
		var products_to_provide = not_provided_products.slice(0, products_nr);

		for(var i=0; i < products_to_provide.length; i++) {
			var p_id = products_to_provide[i];

			var suppliers = sync.await(Supplier.find({_type : "Supplier"}, sync.defer()));
			var nr_suppliers = random(1, suppliers.length);

			var shuffled_suppliers = shuffle(suppliers);
			var rand_suppliers = shuffled_suppliers.slice(0, nr_suppliers);

			var price = random(5, 50);
			for(var j = 0; j < rand_suppliers.length; j++) {
				var supplier = rand_suppliers[j];

				var provide = new Provide({
					"price" : price + random(-5, 5),
					"product_id" : p_id,
					"supplier_id" : supplier.id
				});

				sync.await(provide.save(sync.defer()));
			}
		}

		var suppliers = sync.await(Supplier.find({_type : "Supplier"}, sync.defer()));
		var nr_suppliers = random(1, suppliers.length);

		var shuffled_suppliers = shuffle(suppliers);
		var rand_suppliers = shuffled_suppliers.slice(0, nr_suppliers);

		var price = random(5, 50);
		for(var j = 0; j < rand_suppliers.length; j++) {
			var supplier = rand_suppliers[j];

			var provide = new Provide({
				"price" : price + random(-5, 5),
				"product_id" : 1,
				"supplier_id" : supplier.id
			});

			sync.await(provide.save(sync.defer()));
		}
	}, function (err, data) {
		if(err) console.log("--ERR: Error saving extra provides: " + err);

		console.log("--DO: Saved all extra provides");

		loadSpeacialUsers(callback);
	});

}

function loadSpeacialUsers(callback) {
	sync.fiber(function() {
		//Supplier with no provides
		var supplier1 = new Supplier({
			"_type" : "Supplier",
			"name" : "No Provides",
			"surname" : "Supplier",
			"email" : "no.provides@mail.com",
			"password" : "99b0e8da24e29e4ccb5d7d76e677c2ac", //supplier
			"coordinates" : "37.358716;-5.987814",
			"address" : "1471 Calle De Toledo"
		});

		sync.await(supplier1.save(sync.defer()));

		var credit_card = new Credit_card({
			"holderName" : "No purchases Customer",
			"number" : generator.GenCC("VISA")[0],
			"expirationMonth" : 06,
			"expirationYear" : 2020,
			"cvcCode" : 224
		});

		var cc = sync.await(credit_card.save(sync.defer()));
		var coordinates = randomCoords()

		//Customer with no purchases
		var customer1 = new Customer({
			"_type" : "Customer",
			"name" : "No purchases",
			"surname" : "Customer",
			"email" : "no.purchases@mail.com",
			"password" : "91ec1f9324753048c0096d036a694f86", //customer
			"coordinates": coordinates[0] + ";" + coordinates[1],
			"country":"Spain",
			"city":"La Coruña",
			"address":"3481 Calle Del Prado",
			"phone":"949705177",
			"credit_card_id": cc.id
		});

		sync.await(customer1.save(sync.defer()));
		
		coordinates = randomCoords()
		//Customer with no rules
		var customer2 = new Customer({
			"_type" : "Customer",
			"name" : "No Rules",
			"surname" : "Customer",
			"email" : "no.rules@mail.com",
			"password" : "91ec1f9324753048c0096d036a694f86", //customer
			"coordinates": coordinates[0] + ";" + coordinates[1],
			"country":"Spain",
			"city":"La Coruña",
			"address":"3481 Calle Del Prado",
			"phone":"949705177"
		});

		sync.await(customer2.save(sync.defer()));

	}, function (err, data) {
		if(err) console.log("--ERR: Error saving special users: " + err);

		console.log("--DO: Saved special users");

		clean(callback);
	});
}


function makePurchase(products, customer_id, dates, callback) {
	var index = random(products.length - 5, 0)
	var count = random(5, 2)
	var rand_products = products.slice(index, index + count + 1);

	loadProvides(rand_products, 
	function (provides) {
		sync.fiber(function () {
			var now = new Date();
			var paymentDate = dates[random(0, dates.length)];

			var deliveryDate = new Date(paymentDate);
			deliveryDate.setDate(deliveryDate.getDate() + 15);

			var purchase = new Purchase({
				"deliveryDate" : deliveryDate,
				"paymentDate" : paymentDate,
				"customer_id" : customer_id
			});

			saved = sync.await(purchase.save(sync.defer()))
			var quantity = 1;

			for(var i = 0; i < provides.length; i++) {
				provide = provides[i];

				var purchase_line = new PurchaseLine({
					"quantity" : quantity,
					"price" : provide.price * quantity,
					"purchase_id" : saved.id,
					"provide_id" : provide.id,
					"product_id" : provide.product_id
				});

				sync.await(purchase_line.save(sync.defer()))

				var profile = random(2, 0);

				var rateValue = -1;
				var reputationValue = -1;

				switch(profile) {
					case 0: //Optimistic
						var baseRate = random(5, 3);
						var deviation = -1 * random(0, 1);
						rateValue = baseRate + deviation;

						var baseReputation = random(5, 3);
						deviation = -1 * random(0, 1);
						reputationValue = baseReputation + deviation;								
						break;
					case 1: //Pessimistic
						var baseRate = random(3, 1);
						var deviation = random(0, 1);
						rateValue = baseRate + deviation;

						var baseReputation = random(3, 1);
						deviation = -1 * random(0, 1);
						reputationValue = baseReputation + deviation;
						break;
					case 2: //Neutral
						var baseRate = random(2, 4);
						var deviation = random(1, -1);
						rateValue = baseRate + deviation;

						var baseReputation = random(2, 4);
						deviation = -1 * random(1, -1);
						reputationValue = baseReputation + deviation;
						break;
				}

				var rate = new Rate({
					"value" : rateValue,
					"product_id" : product.id,
					"customer_id" : customer_id
				});

				var reputation = new Reputation({
					"value" : reputationValue,
					"provide_id" : provide.id,
					"customer_id" : customer_id
				});

				sync.await(rate.save(sync.defer()))
				sync.await(reputation.save(sync.defer()))
			}
		}, function (err, data) {
			callback(err, data)
		});
	});
}

function clean(callback) {
	fs.unlinkSync('big_db/categories_mapping.json');

	fs.unlinkSync('big_db/products_mapping.json');

	callback();
}

function loadProvides(products, callback) {
	sync.fiber(function() {
		provides_res = []
		for(var i = 0; i < products.length; i++) {
			product = products[i];

			provides = sync.await(Provide.find({ product_id: product.id, deleted: false }, sync.defer()))

			if(provides.length == 0) {
				var max_suppliers = 3;
				var min_suppliers = 1;

				var nr_suppliers = random(max_suppliers, min_suppliers);

				suppliers = sync.await(Supplier.find({_type : "Supplier"}, sync.defer()))

				var shuffled_suppliers = shuffle(suppliers);
				var rand_suppliers = shuffled_suppliers.slice(0, nr_suppliers);

				var price = random(5, 50);

				for(var j = 0; j < rand_suppliers.length; j++) {
					supplier = rand_suppliers[j]
					var provide = new Provide({
						"price" : price + random(-5, 5),
						"product_id" : product.id,
						"supplier_id" : supplier.id
					});
					saved = sync.await(provide.save(sync.defer()));
				}

				var supplier = rand_suppliers[Math.floor(Math.random() * rand_suppliers.length)];

				provide = sync.await(Provide.findOne({ product_id : product.id, "supplier_id" : supplier.id, deleted: false }, sync.defer()))

				provides_res.push(provide);
			} else {
				var provide = provides[Math.floor(Math.random() * provides.length)];

				provides_res.push(provide);
			}
		}

		return provides_res
	}, function(err, data) {
		if(err) {
			console.log("--ERR Error saving provides, error: " + err)
		}
		callback(data)
	});
}

exports.updateAllAvgRatingAndMinMaxPrice = function (req, res) {
	Product.find(function (err, products) {
		if (err) {
			res.status(500).json({success: false, message: err});
		} else {
			var error = '';
			products.forEach( function(product) {
				ProductService.updateAverageRating(product._id, function (response1) {
					if (!response1){
						error += 'Error updating avg rating of product ID: ' + product._id + '\n';
						console.log('Error updating avg rating of product ID: ' + product._id);
					} else {
						console.log('Updated avgRating of product ID: ' + product._id);
					}
					ProductService.updateMinMaxPrice(product._id, function (response2) {
						if (!response2){
							error += 'Error updating minmax price of product ID: ' + product._id + '\n';
							console.log('Error updating minmax price of product ID: ' + product._id);
						} else {
							console.log('Updated minmax Price of product ID: ' + product._id);
						}
					});
				});
			});
			res.status(200).json('Check console!');
		}
	});
}

exports.fixDeadImages = function (req, res) {
	Product.find(function (err, products) {
		if (err) {
			res.status(500).json({success: false, message: err});
		} else {
			var error = '';
			products.forEach( function (product) {
				try {
					fs.accessSync('public/img/'+product.image, fs.F_OK);
					// Exists, do nothing
				} catch (e) {
					// Not exists or not accessible
					// Update product an set the image to default one
					/*Product.findByIdAndUpdate(product.id, { "$set" : { "image" : "default.jpg" } }, 
					function (err) {
						if (err) console.log("--ERR: Error updating image for product " + product.id + ": " + err);

						console.log("Updated image of product ID: " + product.id);
					})*/
					console.log("Dead image for product " + product.id);
				}
			});
			res.status(200).json('Check console!');
		}
	});
}

exports.loadBigDataset = function (req, res) {
	startProcess(function () {
		console.log("Finished");
	});

	res.status(200).send("Finished.")
}

exports.resetDataset = function (req, res) {
	console.log('Function-management-resetDataset');

	Actor.remove({}, function (err) {
		if(err) console.log("--ERR: Remove actor: " + err);
	});

	Credit_card.remove({}, function (err) {
		if(err) console.log("--ERR: Remove credit card: " + err);

		var credit_card1 = new Credit_card({
			"holderName" : "Nombre Apellido",
			"number" : "4556812969932217",
			"expirationMonth" : 7,
			"expirationYear" : 2030,
			"cvcCode" : 123
		});

		credit_card1.save(function (err, cc1) {
			if(err) console.log("--ERR: Create CC1: " + err);

			var supplier1 = new Customer({
				"_id" : 1,
				"_type" : "Customer",
				"name" : "customer",
				"surname" : "customer",
				"email" : "customer@mail.com",
				"password" : "91ec1f9324753048c0096d036a694f86", //customer
				"coordinates" : "37.358716;-5.987814",
				"address" : "Avda. Reina Mercedes, s/n",
				"country" : "Spain",
				"city" : "Sevilla",
				"phone" : "999999999",
				"credit_card_id" : cc1._id
			});

			customer1.save(function (err) {
				if(err) console.log("--ERR: Create Customer: " + err);
			});
		});

		var credit_card2 = new Credit_card({
			"holderName" : "Customer1",
			"number" : "4024007167504389",
			"expirationMonth" : 12,
			"expirationYear" : 2018,
			"cvcCode" : 907
		});

		credit_card2.save(function (err, cc2) {
			if(err) console.log("--ERR: Create CC2: " + err);

			var customer2 = new Customer({
				"_id" : 2,
				"_type" : "Customer",
				"name" : "customer1",
				"surname" : "customer",
				"email" : "customer1@mail.com",
				"password" : "91ec1f9324753048c0096d036a694f86", //customer
				"coordinates" : "37.358716;-5.987814",
				"address" : "Avda. Reina Mercedes, s/n",
				"country" : "Spain",
				"city" : "Sevilla",
				"phone" : "999999999",
				"credit_card_id" : cc2._id
			});
		});
	});

	var admin = new Admin({
		"_type" : "Admin",
		"name" : "admin",
		"surname" : "admin",
		"email" : "admin@mail.com",
			"password" : "200ceb26807d6bf99fd6f4f0d1ca54d4" //administrator
		});

	admin.save(function (err) {
		if(err) console.log("--ERR: Create Admin: " + err);
	});

	var supplier = new Supplier({
		"_id" : 3,
		"_type" : "Supplier",
		"name" : "supplier1",
		"surname" : "supplier",
		"email" : "supplier@mail.com",
			"password" : "99b0e8da24e29e4ccb5d7d76e677c2ac", //supplier
			"coordinates" : "37.358716;-5.987814",
			"address" : "Avda. Reina Mercedes, s/n"
		});

	var supplier1 = new Supplier({
		"_id" : 4,
		"_type" : "Supplier",
		"name" : "supplier1",
		"surname" : "supplier",
		"email" : "supplier1@mail.com",
			"password" : "99b0e8da24e29e4ccb5d7d76e677c2ac", //supplier
			"coordinates" : "37.358716;-5.987814",
			"address" : "Avda. Reina Mercedes, s/n"
		});

	supplier.save(function (err) {
		if(err) console.log("--ERR: Create Supplier: " + err);
	});

	supplier1.save(function (err) {
		if(err) console.log("--ERR: Create Supplier 1: " + err);
	});

	Product.remove({}, function(err) {
		if(err) console.log('--ERR: Remove products: ' + err);
	});

	var product1 = new Product({
		"_id" : 1,
		"name":"Sunglasses",
		"description":"Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim",
		"code":"12b34a1",
		"image":"img/template_bootstrap/pic5.jpg"
	});
	product1.save(function (err) {
		if(err) console.log("--ERR: Error saving product1: " + err);
	});

	var product2 = new Product({
		"_id" : 2,
		"name":"Cheap Sunglases",
		"description":"Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim",
		"code":"12buua2",
		"image":"img/template_bootstrap/pic5.jpg"
	});
	product2.save(function (err) {
		if(err) console.log("--ERR: Error saving product2: " + err);
	});

	var product3 = new Product({
		"_id" : 3,
		"name":"Dark sunglasses",
		"description":"Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim",
		"code":"12b34a3",
		"image":"img/template_bootstrap/pic5.jpg"
	});
	product3.save(function (err) {
		if(err) console.log("--ERR: Error saving product3: " + err);
	});

	var product4 = new Product({
		"_id" : 4,
		"name":"Light sunglasses",
		"description":"Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim",
		"code":"12buua4",
		"image":"img/template_bootstrap/pic5.jpg"
	});
	product4.save(function (err) {
		if(err) console.log("--ERR: Error saving product4: " + err);
	});

	var product5 = new Product({
		"_id" : 5,
		"name":"Summer sunglasses",
		"description":"Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim",
		"code":"12b34a5",
		"image":"img/template_bootstrap/pic5.jpg"
	});
	product5.save(function (err) {
		if(err) console.log("--ERR: Error saving product5: " + err);
	});

	var product6 = new Product({
		"_id" : 6,
		"name":"Last sunglasses",
		"description":"Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim",
		"code":"12buua6",
		"image":"img/template_bootstrap/pic5.jpg"
	});
	product6.save(function (err) {
		if(err) console.log("--ERR: Error saving product6: " + err);
	});

	var product7 = new Product({
		"_id" : 7,
		"name":"Cool Sunglasses",
		"description":"Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim",
		"code":"12b34a7",
		"image":"img/template_bootstrap/pic5.jpg"
	});
	product7.save(function (err) {
		if(err) console.log("--ERR: Error saving product7: " + err);
	});

	var product8 = new Product({
		"_id" : 8,
		"name":"Blue Sunglases",
		"description":"Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim",
		"code":"12buua8",
		"image":"img/template_bootstrap/pic5.jpg"
	});
	product8.save(function (err) {
		if(err) console.log("--ERR: Error saving product8: " + err);
	});

	var product9 = new Product({
		"_id" : 9,
		"name":"The sunglasses",
		"description":"Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim",
		"code":"12b34a9",
		"image":"img/template_bootstrap/pic5.jpg"
	});
	product9.save(function (err) {
		if(err) console.log("--ERR: Error saving product9: " + err);
	});

	var product10 = new Product({
		"_id" : 10,
		"name":"That sunglasses",
		"description":"Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim",
		"code":"12buuaa",
		"image":"img/template_bootstrap/pic5.jpg"
	});
	product10.save(function (err) {
		if(err) console.log("--ERR: Error saving product10: " + err);
	});

	var product11 = new Product({
		"_id" : 11,
		"name":"Merch sunglasses",
		"description":"Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim",
		"code":"12b34ah",
		"image":"img/template_bootstrap/pic5.jpg"
	});
	product11.save(function (err) {
		if(err) console.log("--ERR: Error saving product11: " + err);
	});

	var product12 = new Product({
		"_id" : 12,
		"name":"Pair of sunglasses",
		"description":"Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim",
		"code":"12buutr",
		"image":"img/template_bootstrap/pic5.jpg"
	});
	product12.save(function (err) {
		if(err) console.log("--ERR: Error saving product12: " + err);
	});

	Category.remove({}, function(err) {
		if(err) console.log('--ERR: Remove category: ' + err);
	});
	var category1 = new Category({
		"_id" : 1,
		"name" : "Category 1" 
	});
	category1.save(function (err, category){
		if(err) console.log("ERR: Saving category1: " + err);
	});

	var category2 = new Category({
		"_id" : 2,
		"name" : "Category 2" 
	});
	category2.save(function (err, category){
		if(err) console.log("ERR: Saving category2: " + err);
	});

	var category3 = new Category({
		"_id" : 3,
		"name" : "Category 3" 
	});
	category3.save(function (err, category){
		if(err) console.log("ERR: Saving category3: " + err);
	});

	var category4 = new Category({
		"_id" : 4,
		"name" : "Category 4" 
	});
	category4.save(function (err, category){
		if(err) console.log("ERR: Saving category4: " + err);
	});

	var category5 = new Category({
		"_id" : 5,
		"name" : "Category 5" 
	});
	category5.save(function (err, category){
		if(err) console.log("ERR: Saving category5: " + err);
	});

	var category6 = new Category({
		"_id" : 6,
		"name" : "Category 6" 
	});
	category6.save(function (err, category){
		if(err) console.log("ERR: Saving category6: " + err);
	});

	Belongs_to.remove({}, function(err) {
		if(err) console.log('--ERR: Remove belongs_to: ' + err);
	});
	var belongs_to1 = new Belongs_to({
		"product_id": 1, 
		"category_id" : 1
	});
	belongs_to1.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to1: " + err);
	});

	var belongs_to2 = new Belongs_to({
		"product_id": 2, 
		"category_id" : 2
	});
	belongs_to2.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to2: " + err);
	});

	var belongs_to3 = new Belongs_to({
		"product_id": 3, 
		"category_id" : 3
	});
	belongs_to3.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to3: " + err);
	});

	var belongs_to4 = new Belongs_to({
		"product_id": 4, 
		"category_id" : 4
	});
	belongs_to4.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to4: " + err);
	});

	var belongs_to5 = new Belongs_to({
		"product_id": 5, 
		"category_id" : 5
	});
	belongs_to5.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to5: " + err);
	});

	var belongs_to6 = new Belongs_to({
		"product_id": 6, 
		"category_id" : 6
	});
	belongs_to6.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to6: " + err);
	});

	var belongs_to7 = new Belongs_to({
		"product_id": 7, 
		"category_id" : 1
	});
	belongs_to7.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to7: " + err);
	});

	var belongs_to8 = new Belongs_to({
		"product_id": 8, 
		"category_id" : 2
	});
	belongs_to8.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to8: " + err);
	});

	var belongs_to9 = new Belongs_to({
		"product_id": 9, 
		"category_id" : 3
	});
	belongs_to9.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to9: " + err);
	});

	var belongs_to10 = new Belongs_to({
		"product_id": 0, 
		"category_id" : 4
	});
	belongs_to10.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to10: " + err);
	});

	var belongs_to11 = new Belongs_to({
		"product_id": 1, 
		"category_id" : 5
	});
	belongs_to11.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to11: " + err);
	});

	var belongs_to12 = new Belongs_to({
		"product_id": 2, 
		"category_id" : 6
	});
	belongs_to12.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to12: " + err);
	});


	var belongs_to13 = new Belongs_to({
		"product_id": 1, 
		"category_id" : 6
	});
	belongs_to13.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to13: " + err);
	});

	var belongs_to14 = new Belongs_to({
		"product_id": 2, 
		"category_id" : 5
	});
	belongs_to14.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to14: " + err);
	});

	var belongs_to15 = new Belongs_to({
		"product_id": 3, 
		"category_id" : 4
	});
	belongs_to15.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to15: " + err);
	});

	var belongs_to16 = new Belongs_to({
		"product_id": 4, 
		"category_id" : 3
	});
	belongs_to16.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to16: " + err);
	});

	var belongs_to17 = new Belongs_to({
		"product_id": 5, 
		"category_id" : 2
	});
	belongs_to17.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to17: " + err);
	});

	var belongs_to18 = new Belongs_to({
		"product_id": 6, 
		"category_id" : 1
	});
	belongs_to18.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to18: " + err);
	});

	var belongs_to19 = new Belongs_to({
		"product_id": 7, 
		"category_id" : 6
	});
	belongs_to19.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to19: " + err);
	});

	var belongs_to20 = new Belongs_to({
		"product_id": 8, 
		"category_id" : 5
	});
	belongs_to20.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to20: " + err);
	});

	var belongs_to21 = new Belongs_to({
		"product_id": 9, 
		"category_id" : 4
	});
	belongs_to21.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to21: " + err);
	});

	var belongs_to22 = new Belongs_to({
		"product_id": 0, 
		"category_id" : 3
	});
	belongs_to22.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to22: " + err);
	});

	var belongs_to23 = new Belongs_to({
		"product_id": 1, 
		"category_id" : 2
	});
	belongs_to23.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to23: " + err);
	});

	var belongs_to24 = new Belongs_to({
		"product_id": 2, 
		"category_id" : 1
	});
	belongs_to24.save(function (err) {
		if(err) console.log("ERR: Savin belongs_to24: " + err);
	});

	Provide.remove({}, function(err) {
		if(err) console.log('--ERR: Remove provide: ' + err);
	});
	var provide1 = new Provide({
		"price" : 0.79, 
		"product_id": 01, 
		"supplier_id" : 3 
	});
	provide1.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 1: " + err);
	});

	var provide2 = new Provide({
		"price" : 0.7, 
		"product_id": 02, 
		"supplier_id" : 3 
	});
	provide2.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 2: " + err);
	});

	var provide3 = new Provide({
		"price" : 1, 
		"product_id": 03, 
		"supplier_id" : 3 
	});
	provide3.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 3: " + err);
	});

	var provide4 = new Provide({
		"price" : 0.3, 
		"product_id": 04, 
		"supplier_id" : 3 
	});
	provide4.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 4: " + err);
	});

	var provide5 = new Provide({
		"price" : 5.2, 
		"product_id": 05, 
		"supplier_id" : 3 
	});
	provide5.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 5: " + err);
	});

	var provide6 = new Provide({
		"price" : 6.2, 
		"product_id": 06, 
		"supplier_id" : 3 
	});
	provide6.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 6: " + err);
	});

	var provide7 = new Provide({
		"price" : 25, 
		"product_id": 07, 
		"supplier_id" : 3 
	});
	provide7.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 7: " + err);
	});

	var provide8 = new Provide({
		"price" : 128, 
		"product_id": 08, 
		"supplier_id" : 3 
	});
	provide8.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 8: " + err);
	});

	var provide9 = new Provide({
		"price" : 44.99, 
		"product_id": 09, 
		"supplier_id" : 3 
	});
	provide9.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 9: " + err);
	});

	var provide10 = new Provide({
		"price" : 599, 
		"product_id": 10, 
		"supplier_id" : 3 
	});
	provide10.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 10: " + err);
	});

	var provide11 = new Provide({
		"price" : 10.36, 
		"product_id": 11, 
		"supplier_id" : 3 
	});
	provide11.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 11: " + err);
	});

	var provide12 = new Provide({
		"price" : 1.84, 
		"product_id": 12, 
		"supplier_id" : 3 
	});
	provide12.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 12: " + err);
	});


	var provide13 = new Provide({
		"price" : 0.12, 
		"product_id": 01, 
		"supplier_id" : 4 
	});
	provide13.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 13: " + err);
	});

	var provide14 = new Provide({
		"price" : 0.71, 
		"product_id": 02, 
		"supplier_id" : 4 
	});
	provide14.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 14: " + err);
	});

	var provide15 = new Provide({
		"price" : 1.2, 
		"product_id": 03, 
		"supplier_id" : 4 
	});
	provide15.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 15: " + err);
	});

	var provide16 = new Provide({
		"price" : 0.1, 
		"product_id": 04, 
		"supplier_id" : 4 
	});
	provide16.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 16: " + err);
	});

	var provide17 = new Provide({
		"price" : 5.99, 
		"product_id": 05, 
		"supplier_id" : 4 
	});
	provide17.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 17: " + err);
	});

	var provide18 = new Provide({
		"price" : 9.99, 
		"product_id": 06, 
		"supplier_id" : 4 
	});
	provide18.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 18: " + err);
	});

	var provide19 = new Provide({
		"price" : 25.2, 
		"product_id": 07, 
		"supplier_id" : 4 
	});
	provide19.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 19: " + err);
	});

	var provide20 = new Provide({
		"price" : 128.01, 
		"product_id": 08, 
		"supplier_id" : 4 
	});
	provide20.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 20: " + err);
	});

	var provide21 = new Provide({
		"price" : 44.02, 
		"product_id": 09, 
		"supplier_id" : 4 
	});
	provide21.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 21: " + err);
	});

	var provide22 = new Provide({
		"price" : 720, 
		"product_id": 10, 
		"supplier_id" : 4 
	});
	provide22.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 22: " + err);
	});

	var provide23 = new Provide({
		"price" : 17, 
		"product_id": 11, 
		"supplier_id" : 4 
	});
	provide23.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 23: " + err);
	});

	var provide24 = new Provide({
		"price" : 4, 
		"product_id": 12, 
		"supplier_id" : 4 
	});
	provide24.save(function(err) {
		if(err) console.log("--ERR: Error saving provide 24: " + err);
	});

	Purchase.remove({}, function(err) {
		if(err) console.log('--ERR: Remove purchase: ' + err);
	});
	var purchase1 = new Purchase({
		"_id": 1, 
		"deliveryDate" : new Date(1485961200*1000), 
		"paymentDate": new Date(1453029600*1000), 
		"customer_id" : 2
	});
	purchase1.save(function(err) {
		if(err) console.log("--ERR: Saving purchase1: " + err);
	});

	var purchase2 = new Purchase({
		"_id": 2, 
		"deliveryDate" : new Date(1485961200*1000), 
		"paymentDate": new Date(1453029600*1000), 
		"customer_id" : 2
	});
	purchase2.save(function(err) {
		if(err) console.log("--ERR: Saving purchase2: " + err);
	});


	var purchase3 = new Purchase({
		"_id": 3, 
		"deliveryDate" : new Date(1485961200*1000), 
		"paymentDate": new Date(1453029600*1000), 
		"customer_id" : 5
	});
	purchase3.save(function(err) {
		if(err) console.log("--ERR: Saving purchase3: " + err);
	});

	var purchase4 = new Purchase({
		"_id": 4, 
		"deliveryDate" : new Date(1485961200*1000), 
		"paymentDate": new Date(1453029600*1000), 
		"customer_id" : 5
	});
	purchase4.save(function(err) {
		if(err) console.log("--ERR: Saving purchase4: " + err);
	});

	PurchaseLine.remove({}, function(err) {
		if(err) console.log('--ERR: Remove purchase line: ' + err);
	});
	var purchaseLine1 = new PurchaseLine({
		"quantity": 1, 
		"purchase_id" : 1, 
		"provide_id" : 01 
	});
	purchaseLine1.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 1: " + err);
	});

	var purchaseLine2 = new PurchaseLine({
		"quantity": 2, 
		"purchase_id" : 1, 
		"provide_id" : 02 
	});
	purchaseLine2.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 2: " + err);
	});

	var purchaseLine3 = new PurchaseLine({
		"quantity": 3, 
		"purchase_id" : 1, 
		"provide_id" : 03 
	});
	purchaseLine3.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 3: " + err);
	});

	var purchaseLine4 = new PurchaseLine({
		"quantity": 4, 
		"purchase_id" : 1, 
		"provide_id" : 04 
	});
	purchaseLine4.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 4: " + err);
	});

	var purchaseLine5 = new PurchaseLine({
		"quantity": 5, 
		"purchase_id" : 1, 
		"provide_id" : 05 
	});
	purchaseLine5.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 5: " + err);
	});

	var purchaseLine6 = new PurchaseLine({
		"quantity": 6, 
		"purchase_id" : 1, 
		"provide_id" : 06 
	});
	purchaseLine6.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 6: " + err);
	});


	var purchaseLine7 = new PurchaseLine({
		"quantity": 1, 
		"purchase_id" : 2, 
		"provide_id" : 10 
	});
	purchaseLine7.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 7: " + err);
	});

	var purchaseLine8 = new PurchaseLine({
		"quantity": 2, 
		"purchase_id" : 2, 
		"provide_id" : 11 
	});
	purchaseLine8.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 8: " + err);
	});

	var purchaseLine9 = new PurchaseLine({
		"quantity": 3, 
		"purchase_id" : 2, 
		"provide_id" : 12 
	});
	purchaseLine9.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 9: " + err);
	});

	var purchaseLine10 = new PurchaseLine({
		"quantity": 4, 
		"purchase_id" : 2, 
		"provide_id" : 13 
	});
	purchaseLine10.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 10: " + err);
	});

	var purchaseLine11 = new PurchaseLine({
		"quantity": 5, 
		"purchase_id" : 2, 
		"provide_id" : 14 
	});
	purchaseLine11.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 11: " + err);
	});

	var purchaseLine12 = new PurchaseLine({
		"quantity": 6, 
		"purchase_id" : 2, 
		"provide_id" : 15 
	});
	purchaseLine12.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 12: " + err);
	});

	var purchaseLine13 = new PurchaseLine({
		"quantity": 1, 
		"purchase_id" : 3, 
		"provide_id" : 01 
	});
	purchaseLine13.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 13: " + err);
	});

	var purchaseLine14 = new PurchaseLine({
		"quantity": 2, 
		"purchase_id" : 3, 
		"provide_id" : 02 
	});
	purchaseLine14.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 14: " + err);
	});

	var purchaseLine15 = new PurchaseLine({
		"quantity": 3, 
		"purchase_id" : 3, 
		"provide_id" : 03 
	});
	purchaseLine15.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 15: " + err);
	});

	var purchaseLine16 = new PurchaseLine({
		"quantity": 4, 
		"purchase_id" : 3, 
		"provide_id" : 04 
	});
	purchaseLine16.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 16: " + err);
	});

	var purchaseLine17 = new PurchaseLine({
		"quantity": 5, 
		"purchase_id" : 3, 
		"provide_id" : 05 
	});
	purchaseLine17.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 17: " + err);
	});

	var purchaseLine18 = new PurchaseLine({
		"quantity": 6, 
		"purchase_id" : 3, 
		"provide_id" : 06 
	});
	purchaseLine18.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 18: " + err);
	});


	var purchaseLine19 = new PurchaseLine({
		"quantity": 1, 
		"purchase_id" : 4, 
		"provide_id" : 10 
	});
	purchaseLine19.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 19: " + err);
	});

	var purchaseLine20 = new PurchaseLine({
		"quantity": 2, 
		"purchase_id" : 4, 
		"provide_id" : 11 
	});
	purchaseLine20.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 20: " + err);
	});

	var purchaseLine21 = new PurchaseLine({
		"quantity": 3, 
		"purchase_id" : 4, 
		"provide_id" : 12 
	});
	purchaseLine21.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 21: " + err);
	});

	var purchaseLine22 = new PurchaseLine({
		"quantity": 4, 
		"purchase_id" : 4, 
		"provide_id" : 13 
	});
	purchaseLine22.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 22: " + err);
	});

	var purchaseLine23 = new PurchaseLine({
		"quantity": 5, 
		"purchase_id" : 4, 
		"provide_id" : 14 
	});
	purchaseLine23.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 23: " + err);
	});

	var purchaseLine24 = new PurchaseLine({
		"quantity": 6, 
		"purchase_id" : 4, 
		"provide_id" : 15 
	});
	purchaseLine24.save(function(err) {
		if(err) console.log("--ERR: Error saving Purchase Line 24: " + err);
	});

	Rate.remove({}, function(err) {
		if(err) console.log('--ERR: Remove rates: ' + err);
	});
	var rate1 = new Rate({
		"value": 1, 
		"product_id" : 01, 
		"customer_id" : 2
	});
	rate1.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 1: " + err);
	});

	var rate2 = new Rate({
		"value": 2, 
		"product_id" : 02, 
		"customer_id" : 2
	});
	rate2.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 2: " + err);
	});

	var rate3 = new Rate({
		"value": 3, 
		"product_id" : 03, 
		"customer_id" : 2
	});
	rate3.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 3: " + err);
	});

	var rate4 = new Rate({
		"value": 2, 
		"product_id" : 04, 
		"customer_id" : 2
	});
	rate4.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 4: " + err);
	});

	var rate5 = new Rate({
		"value": 4, 
		"product_id" : 05, 
		"customer_id" : 2
	});
	rate5.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 5: " + err);
	});

	var rate6 = new Rate({
		"value": 1, 
		"product_id" : 06, 
		"customer_id" : 2
	});
	rate6.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 6: " + err);
	});

	var rate7 = new Rate({
		"value": 5, 
		"product_id" : 10, 
		"customer_id" : 2
	});
	rate7.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 7: " + err);
	});

	var rate8 = new Rate({
		"value": 2, 
		"product_id" : 11, 
		"customer_id" : 2
	});
	rate8.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 8: " + err);
	});

	var rate9 = new Rate({
		"value": 4, 
		"product_id" : 12, 
		"customer_id" : 2
	});
	rate9.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 9: " + err);
	});

	var rate10 = new Rate({
		"value": 3, 
		"product_id" : 01, 
		"customer_id" : 5
	});
	rate10.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 10: " + err);
	});

	var rate11 = new Rate({
		"value": 4, 
		"product_id" : 02, 
		"customer_id" : 5
	});
	rate11.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 11: " + err);
	});

	var rate12 = new Rate({
		"value": 1, 
		"product_id" : 03, 
		"customer_id" : 5
	});
	rate12.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 12: " + err);
	});

	var rate13 = new Rate({
		"value": 2, 
		"product_id" : 04, 
		"customer_id" : 5
	});
	rate13.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 13: " + err);
	});

	var rate14 = new Rate({
		"value": 5, 
		"product_id" : 05, 
		"customer_id" : 5
	});
	rate14.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 14: " + err);
	});

	var rate15 = new Rate({
		"value": 2, 
		"product_id" : 06, 
		"customer_id" : 5
	});
	rate15.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 15: " + err);
	});

	var rate16 = new Rate({
		"value": 3, 
		"product_id" : 10, 
		"customer_id" : 5
	});
	rate16.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 16: " + err);
	});

	var rate17 = new Rate({
		"value": 5, 
		"product_id" : 11, 
		"customer_id" : 5
	});
	rate17.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 17: " + err);
	});

	var rate18 = new Rate({
		"value": 1, 
		"product_id" : 12, 
		"customer_id" : 5
	});
	rate18.save(function(err) {
		if(err) console.log("--ERR: Saving Rate 18: " + err);
	});

	Reputation.remove({}, function(err) {
		if(err) console.log('--ERR: Remove reputations: ' + err);
	});
	var reputation1 = new Reputation({
		"value": 3, 
		"supplier_id" : 3, 
		"customer_id" : 2
	});
	reputation1.save(function(err) {
		if(err) console.log("--ERR: saving reputation 1: " + err);
	});

	var reputation2 = new Reputation({
		"value": 4, 
		"supplier_id" : 4, 
		"customer_id" : 2
	});
	reputation2.save(function(err) {
		if(err) console.log("--ERR: saving reputation 2: " + err);
	});

	var reputation3 = new Reputation({
		"value": 5, 
		"supplier_id" : 3, 
		"customer_id" : 5
	});
	reputation3.save(function(err) {
		if(err) console.log("--ERR: saving reputation 3: " + err);
	});

	var reputation4 = new Reputation({
		"value": 2, 
		"supplier_id" : 4, 
		"customer_id" : 5
	});
	reputation4.save(function(err) {
		if(err) console.log("--ERR: saving reputation 4: " + err);
	});
	res.json("Done, check the console");
};