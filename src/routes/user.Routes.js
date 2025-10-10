const userController = require("../controllers/user.Controller");
const {Router} = require("express");
const { authenticateToken } = require("../middlewares/auth.middleware");
const userRouter = Router();



userRouter.get("/", userController.getUser);
userRouter.post("/register", userController.register);
userRouter.post("/login", userController.login);
userRouter.post("/validate-token", authenticateToken, userController.validateToken);

module.exports = {userRouter}