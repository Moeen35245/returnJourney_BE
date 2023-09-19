import express from 'express';
import checkAuth, { resetAuth } from '../middleware/checkAuth.js';
import { add, verify, login, resendOtp, resetPass, resetPassVerify } from '../controllers/user.js';
const router = express.Router();

router.route('/signup').post(add);
router.route('/verify').post(verify);
router.route('/login').post(login);
router.route('/resend').post(resendOtp);
router.route('/resetVerify').post(resetPassVerify);
router.route('/resetPass').post(resetAuth, resetPass);

export default router;
