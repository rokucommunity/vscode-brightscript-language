"use strict";

// Exporting connect integration.
module.exports = auth => {
  return (req, res, next) => {
    auth.check((req, res, err) => {
      if (err) {
        next(err);
      } else {
        next();
      }
    })(req, res);
  };
};
