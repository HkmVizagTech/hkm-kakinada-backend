const jwt = require("jsonwebtoken");
const userModel = require("../models/userModel");

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
      return res.status(401).json({ 
        status: 'error',
        message: 'Access token required' 
      });
    }


    const decoded = jwt.verify(token, "saikiranjwtkey");

    const user = await userModel.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ 
        status: 'error',
        message: 'User no longer exists' 
      });
    }

   
    req.user = {
      id: user._id,
      email: user.email,
      role: user.role,
      name: user.name
    };

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ 
      status: 'error',
      message: 'Invalid or expired token' 
    });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        status: 'error',
        message: 'Authentication required' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        status: 'error',
        message: 'Insufficient permissions' 
      });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole
};