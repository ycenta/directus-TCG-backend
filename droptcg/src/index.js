export default {
	id: 'test',
	handler: (router, context) => {
		const { services, getSchema } = context;
		const { UsersService, AuthenticationService, RolesService, ItemsService, PermissionsService } = services;

		router.get('/test-api', async (req, res) => {
			if (req.accountability?.user == null) { 
				res.status(403); 
				return res.send(`You don't have permission to access this.`); 
			}else{
				//console.log('req.accountability?.user:', req.accountability?.user);
				res.send('Hello, World!, you have access to this');
			}
		});

		router.post('/pack-open', async (req, res) => {

			const packId = req.body.packId;
			if(!packId){
				res.sendStatus(404);
				return;
			}
			//on récupère l'user
			const usersService = new UsersService({
				schema: await getSchema(),
				accountability: req.accountability
			});
			const data = await usersService.readOne(req.accountability.user);
			if(!data){
				res.sendStatus(403);
			}
			const userId = data.id;

			//on récupère la ligne de la relation (le packs de l'user)
			const itemsService = new ItemsService('junction_directus_users_pack', {
				schema: await getSchema(),
				accountability: {admin:true}
			});
			const dataRelation = await itemsService.readOne(packId)
			// console.log("dataRelation", dataRelation);
			if(!dataRelation){
				res.sendStatus(404);
				return;
			}
			if(dataRelation.directus_users_id != data.id){ //Si le pack n'appartient pas à l'utilisateur on return une 403
				res.sendStatus(403);
				return;
			}
			
			try {
				//Get pack of the relation
				const packsService = new ItemsService('pack', {
					schema: await getSchema(),
					accountability: {admin:true}
				})
				const packOpened = await packsService.readByQuery({
					filter: { id : dataRelation.pack_id},
					fields:['*','item.*']
				});

				if(!packOpened){
					res.sendStatus(403);
				}

				if(!packOpened[0].item){
					res.sendStatus(403);
				}

				//Random drop function initiationisation (dropping system)
				const pickRandomItemWithRate = (items) => {
					// if (!items || items.length === 0) {
					// 	throw new Error("Le tableau d'items ne doit pas être vide.");
					// }
				
					const totalRate = items.reduce((total, item) => total + item.rate, 0);
					const random = Math.random() * totalRate;
				
					return items.find((item, index, arr) => {
						const cumulativeRate = arr.slice(0, index + 1).reduce((sum, i) => sum + i.rate, 0);
						return random <= cumulativeRate;
					});
				};
				
				const itemDropped = [];
				for (let index = 0; index < 3; index++) {
					const selectedItem = pickRandomItemWithRate(packOpened[0].item);
					if(!selectedItem){
						itemDropped.push(packOpened[0].item[0])
					}else{
						itemDropped.push(selectedItem)
					}
				}

				//console.log("itemDropped",itemDropped);

				//now add the items to the user inventory
				const userItemService = new ItemsService('junction_directus_users_items', { //init the service
					schema: await getSchema(),
					accountability: {admin:true}
				});
				
				const itemsDroppedIds = [];
				await itemDropped.forEach((item) => {
					const data = userItemService.createOne({
						directus_users_id: userId,
						items_id: item.items_id,
					});
					itemsDroppedIds.push(item.items_id);
				 });

				const userItemsService = new ItemsService('items', {
					schema: await getSchema(),
					accountability: {admin:true}
				});
				 //now get the items through a request .readByQuery 
				//console.log('itemsDroppedIds', itemsDroppedIds)
				const userItems = await userItemsService.readByQuery({
					filter: { id:
						{
						_in: itemsDroppedIds
						}
					},
					fields: ['*']
				});

				const finalArrayToReturn = [];
				for (let index = 0; index < itemDropped.length; index++) {
					const element = itemDropped[index];
					const item = userItems.find((item) => item.id == element.items_id);
					finalArrayToReturn.push(item);
				}

				res.json(finalArrayToReturn);
				
			} catch (error) {
				//console.log("error",error)
				res.sendStatus(500);
			}

		});

		router.post('/shop-buy', async (req, res) => {

			try {
				const shopId = req.body.shopId;
				//console.log("shopId", shopId);
				 //get the shop item (to get the price)
				const itemsService = new ItemsService('shop', {
					schema: await getSchema(),
					accountability: {admin:true}
				});
				const shopItem = await itemsService.readOne(shopId);
				if(!shopItem){
					res.sendStatus(404);
					return;
				}
				// console.log("shopItem", shopItem);
	
				//get the user (to get the money)
				const usersService = new UsersService({
					schema: await getSchema(),
					accountability: {admin:true}
				});
				const data = await usersService.readOne(req.accountability.user);
				if(!data){
					res.sendStatus(403);
				}
				const userMoney = data.money ?? 0;
				//console.log("userMoney", userMoney);
	
				if(userMoney < shopItem.price){
					res.sendStatus(403);
					return;
				}
				const newMoney = userMoney - shopItem.price;
	
				//now add the items to the user inventory
				const isItem = shopItem.item != null;
				const isPack = shopItem.pack != null;
				//console.log("isItem", isItem);	
				//console.log("isPack", isPack);
	
				if(isItem){
					//console.log("in isItem");
					const userItemService = new ItemsService('junction_directus_users_items', { //init the service
						schema: await getSchema(),
						accountability: {admin:true}
					});
					
					const dataUserItem = await userItemService.createOne({
						directus_users_id: data.id,
						items_id: shopItem.item,
					});
					//update user money TODO
					const updateUserMoney =  await usersService.updateOne(req.accountability.user,
						{
							money: newMoney,
						}
					);

					if(dataUserItem){
						res.json("success");
					}else{
						res.sendStatus(403);
					}
	
				}else{
					if(isPack){
						//console.log("in isPack");
						const userPackService = new ItemsService('junction_directus_users_pack', { //init the service
							schema: await getSchema(),
							accountability: {admin:true}
						});
						
						const dataUserPack = await userPackService.createOne({
							directus_users_id: data.id,
							pack_id: shopItem.pack,
						});
						const updateUserMoney =  await usersService.updateOne(req.accountability.user,
							{
								money: newMoney,
							}
						);

						if(dataUserPack){
							res.json("success");
						}else{
							res.sendStatus(403);
						}
					}else{
						res.sendStatus(403);
					}
				}
	
			} catch (error) {
				console.log("error",error)
				res.sendStatus(500);
			}
		});

		router.get('/self', async (req, res) => {
			// if (!req.accountability?.user) return next(new ForbiddenException());
			const schema = await getSchema();
			const usersService = new UsersService({
				schema: await getSchema(),
				accountability: req.accountability
			});
			const userData = await usersService.readOne(req.accountability.user);			
			res.json(userData);
		});

		//Twitch auth route
		router.get("/twitch-callback", async (req, res) => {
			try {
			  const dataReq = req.query;
			  const schema = await getSchema();
			  const authenService = new AuthenticationService({
				schema,
			  });

			let code = dataReq.code;
  			let scope = dataReq.scope;

			if(!code){
				res.send("error sorry wrong code");
				return;
			}

			//Fetch the auth token and refresh token of twitch account
			const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${process.env.TWITCH_REDIRECT_URI}`, {
				method: 'POST',
				headers: {
				  'Content-Type': 'application/json'
				}
			});
			  
			const data = await response.json();
			//   console.log('data:', data);
			  if(data.error){
				res.send("error sorry");
				return;
			  }
			  if(!data.access_token){
				res.send("error sorry");
				return;
			  }

			  //With thoses token, ask the twitch api for the email, name and twitch id of the user
			  const response2 = await fetch('https://api.twitch.tv/helix/users', {
				method: 'GET',
				headers: {
				  'Client-ID': process.env.TWITCH_CLIENT_ID,
				  'Authorization': `Bearer ${data.access_token}`
				}
			  });
			  const data2 = await response2.json();
			  //console.log("data  from twitch", data2);

			  if(data2.data.length > 0){
				if(data2.data[0].id){
				  //check if there is a user with this twitch_id in the database

				  const adminAccountability = {admin:true};
				  
					const usersServiceAdmin = new UsersService({
						schema: await getSchema(),
						accountability: adminAccountability
					});

					// console.log("userServiceAdmin",usersServiceAdmin )
					const dataUser = await usersServiceAdmin.getUserByEmail(data2.data[0].email);
					// console.log("dataUser", dataUser);


					if(dataUser){ //now auth as the user (if it exist)

					//On récupère l'item et plus l'utilisateur pour avoir ses autres 
						const itemsService = new ItemsService('directus_users', {
							schema: await getSchema(),
							accountability: {admin:true}
						});
				
						const dataUserItem = await itemsService.readOne(dataUser.id);
						const authenService = new AuthenticationService({
							schema,
						});
						//console.log("data2.data[0].email", data2.data[0].email);
						const loginResponse = await authenService
							.login("default", { email: data2.data[0].email , password: dataUserItem.twitch_upwd }, { session: false })
							.catch((err) => {
								console.log("error:", err)
							});

						//console.log("login",loginResponse);

						//if user exist, return the token of the user
						res.json(loginResponse);
					
					}else{
						const rolesService = new RolesService({
							schema: await getSchema(),
							accountability: {admin:true}
						});
						//create a new user
						const roles = await rolesService.readByQuery({
							fields: ['*'],
						});

						const foundRole = roles.find((item) => item.name == 'connected');
						//console.log("foundRole", foundRole);
						if(!foundRole){
							res.send("error role sorry");
							return;
						}
						const data = await usersServiceAdmin.createOne({
							email: data2.data[0].email,
							first_name: data2.data[0].display_name,
							role: foundRole.id,
							password: process.env.RANDOM_PWD,
							twitch_upwd: process.env.RANDOM_PWD,
						});

						res.json(data);
					}
				}
			}
			} catch (error) {
				console.log('error:', error);
				res.send("error sorry");
			}
		});

		router.get("/items", async (req, res) => {
			const itemsService = new ItemsService('junction_directus_users_items', {
				schema: await getSchema(),
				accountability: {admin:true}
			});
			const items = await itemsService.readByQuery({
				limit: -1,
				fields: ['*', 'items_id.*','items_id.rarity.*'],
				filter: {
					directus_users_id: req.accountability.user
				},
			});
			// ?groupBy[]=items_id&aggregate[count]=*
			//console.log("user items", items);
			res.json(items);
		});
	},
};