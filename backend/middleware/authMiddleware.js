import jwt from 'jsonwebtoken';

const protect = (req, res, next) => {
  // Check if Authorization header exists and starts with 'Bearer'
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      const token = req.headers.authorization.split(' ')[1];

      if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
      }

      // Verify token
      const jwtSecret = process.env.JWT_SECRET || 'dtr-checker-app-secret-key-2024';
      const decoded = jwt.verify(token, jwtSecret);

      // Attach user information to the request object
      // In a real app, you might fetch full user details from DB here
      req.user = decoded; // decoded will contain { USERID, BADGENUMBER } from login
      if (decoded.authMethod) {
        req.authMethod = decoded.authMethod;
      }
      if (typeof decoded.isPortal === 'boolean') {
        req.isPortal = decoded.isPortal;
      }
      next();
    } catch (error) {
      console.error('Token verification failed:', error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    // Log debug info when no token is found
    console.log('No authorization header found:', {
      url: req.url,
      method: req.method,
      hasAuthHeader: !!req.headers.authorization,
      authHeader: req.headers.authorization ? 'present but invalid format' : 'missing',
      allHeaders: Object.keys(req.headers)
    });
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export { protect };
