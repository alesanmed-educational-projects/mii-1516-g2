var db_connection = require('./db_connection');
var Customer = require('../models/customer');


exports.getCustomer = function (req, res) {
	var connection = db_connection.connect;
	var _email = req.params.email;
	var _pasword = req.params.password;
	console.log('Function-productsApi-getCustumer -- _email:'+_email+' _pasword:'+_pasword);


	Customer.findOne({email:_email},function(err,custumer){
		if(err){
			//console.log('--Costumer not found');
			console.error(err);
			res.sendStatus(404);
			connection.disconnect;
		}
		else{
			//if(custumer.)
			//console.log('--Costumer found'+custumer);
			res.json(custumer);
			res.sendStatus(200);
			connection.disconnect;
		}
	});
};

exports.newCustomer = function (req, res) {
	var connection = db_connection.connect;
	console.log('Function-productsApi-newCustomer');

	//Guardar la entrada de datos en variables
    var _name = req.params.name;
    var _surname = req.params.surname;
    var _email = req.params.email;
    var _password = req.params.password;
    var _address = req.params.address;
    var _coordinates = req.params.coordinates;
    var _credict_car = req.params.credict_card;

    //TODO Chequear que los campos son correctos

	
    //var md5Password = crypto.createHash('md5').update(_password).digest("hex");

    var newCustomer = new Customer({
	    name: _name,
	    surname: _surname,
	    email: _email,
	    password: _password,
	    address: _address,
	    coordinates: _coordinates,
	    credict_card: _credict_car
    });


    newCustomer.save(function (err) {
  		if(err){
			console.error(err);
		}
		else{
			//console.log('--New custumer created');
			res.sendStatus(200);
		}
	});
	connection.disconnect;

};



