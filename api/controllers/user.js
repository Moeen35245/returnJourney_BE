import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import otpGenerator from 'otp-generator';
import IP from 'ip';
import axios from 'axios';
import { validate, validateTypes } from '../utils/validation.js';

const prisma = new PrismaClient();

import { Vonage } from '@vonage/server-sdk';

const vonage = new Vonage({
    apiKey: process.env.VONAGE_KEY,
    apiSecret: process.env.VONAGE_SECRET,
});

const API_KEY = process.env.API_KEY;
const URL = 'https://ipgeolocation.abstractapi.com/v1/?api_key=' + API_KEY;

const from = 'Vonage APIs';

const getUserLocation = async (ipAddress) => {
    const apiResponse = await axios.get(URL + '&ip_address=' + ipAddress);
    return apiResponse.data;
};

async function sendSMS(to, from, text) {
    await vonage.sms
        .send({ to, from, text })
        .then((resp) => {
            // console.log('Message sent successfully');
            // console.log(resp);
        })
        .catch((err) => {
            console.log('There was an error sending the messages.');
            console.error(err);
        });
}

// this will add a new user in our database
export const add = async (req, res) => {
    console.log(req.socket.remoteAddress);
    let { phone, password, confirm } = req.body;

    // detecting the ip address
    const ipAddress = IP.address();
    const ipAddressInformation = await getUserLocation(ipAddress);
    // console.log(ipAddressInformation);

    // i m not sure what will be the best use case of detecting ip address
    if (ipAddressInformation.country && ipAddressInformation.country !== 'India') {
        return res.status(400).json({ message: 'Only indian users allowed' });
    }

    // All fields are required
    if (!(phone && password && confirm)) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    // password and confirm password must be same
    if (password !== confirm) {
        return res.status(400).json({ message: 'Password not match' });
    }

    // minimum length must be 8
    if (password.length < 8) {
        return res.status(400).json({ message: 'minimum length should be 8' });
    }

    // validating phone number with regex
    const isValid = validate(res, validateTypes.PHONE, phone);

    if (isValid.error) {
        return res.status(400).json({ message: isValid.message });
    }

    const otpCode = otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        specialChars: false,
        lowerCaseAlphabets: false,
    });

    const result = await prisma.user.findFirst({
        where: {
            phone: phone,
        },
    });

    // otp message
    const message = `DO NOT SHARE: Your ReturnJourney OTP is ${otpCode}\nThis is only valid for 10 mins\n`;

    // if the isActive status is true then only a user will be considered as a registered user

    if (result && result.isActive) {
        return res.status(422).json({ message: 'Phone number already exist' });
    }

    try {
        // hashing password
        const hassPass = await bcrypt.hash(password, 10);

        // if a user is exist but its isActive status is false
        // that means he/she has not verify number by otp
        // in this istuation we will just update the password and sent a otp to their number
        if (result) {
            const user = await prisma.user.update({
                where: {
                    phone: phone,
                },
                data: {
                    password: hassPass,
                },
            });

            const newOtp = await prisma.otp.create({
                data: {
                    userId: result.userId,
                    code: otpCode,
                },
            });
            // send the otp on the phone number
            await sendSMS(`91${phone}`, from, message);

            return res
                .status(201)
                .json({ message: 'Otp sent to your phone', user: { uid: user.userId, phone: user.phone } });
        }

        // if a user is completely new
        const user = await prisma.user.create({
            data: {
                phone: phone,
                password: hassPass,
            },
        });

        let userId = user?.userId;
        const newOtp = await prisma.otp.create({
            data: {
                userId: userId,
                code: otpCode,
            },
        });
        //  send the otp on the phone number
        await sendSMS(`91${phone}`, from, message);

        return res
            .status(201)
            .json({ message: 'Otp sent to your phone', user: { uid: user.userId, phone: user.phone } });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Internel Server Error' });
    }
};

export const verify = async (req, res) => {
    const { phone, code } = req.body;

    if (!phone || !code) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    // validating phone and otp code by regex value
    const isValid1 = validate(res, validateTypes.PHONE, phone);
    const isValid2 = validate(res, validateTypes.OTP, code);
    if (isValid1.error) {
        return res.status(400).json({ message: isValid1.message });
    }

    if (isValid2.error) {
        return res.status(400).json({ message: isValid2.message });
    }

    try {
        // calculation of 10 min gap
        // if our expiry time and current time has more then 10 min gap we will not consider that otp
        const currentTimestamp = new Date(); // Get current timestamp
        const gapTime = new Date(currentTimestamp.getTime() - 10 * 60 * 1000);

        const user = await prisma.user.findFirst({
            where: { phone: phone },
        });

        if (!user) {
            return res.status(404).json({ message: 'This number is not registered yet' });
        }

        const otpRecord = await prisma.otp.findFirst({
            where: {
                userId: user.userId,
                code: code,
                expiry: {
                    gte: gapTime,
                },
            },
            include: {
                User: true, // Include the user information
            },
        });

        if (!otpRecord) {
            return res.status(404).json({ message: 'Invalid OTP' });
        }

        // if otp is found we will update the users status isActive to true
        await prisma.user.update({
            where: { userId: otpRecord.userId },
            data: { isActive: true },
        });

        // a token will generated and sent to the user
        // we can verify authentic user by this token
        const token = jwt.sign(
            {
                phone: otpRecord.User.phone,
                userId: otpRecord.User.userId,
            },
            process.env.JWT_SECRET
        );

        return res
            .status(200)
            .json({ message: 'Auth successful', data: { token, uid: user.userId, phone: user.phone } });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return res.status(500).json({ message: 'Internal Server Error', error });
    }
};

export const login = (req, res, next) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 8) {
        return res.status(400).json({ message: 'minimum length should be 8' });
    }

    const isValid = validate(res, validateTypes.PHONE, phone);

    if (isValid.error) {
        return res.status(400).json({ message: isValid.message });
    }

    prisma.user
        .findFirst({
            where: {
                phone: phone,
            },
        })
        .then((user) => {
            if (!user || !user.isActive) {
                return res.status(401).json({ message: 'Invalid Phone Number' });
            }
            bcrypt.compare(password, user.password, (err, result) => {
                if (err) {
                    return res.status(401).json({ message: 'Auth failed' });
                }
                if (result) {
                    const token = jwt.sign(
                        {
                            phone: user.phone,
                            userId: user.userId,
                        },
                        process.env.JWT_SECRET
                    );

                    return res
                        .status(200)
                        .json({ message: 'Auth successful', data: { token, uid: user.userId, email: user.phone } });
                }
                return res.status(401).json({ message: 'Auth failed' });
            });
        })
        .catch((err) => {
            console.log(err);
            return res.status(500).json({ error: err });
        });
};

export const resendOtp = async (req, res, next) => {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ message: 'phone number is required' });
    }

    const isValid = validate(res, validateTypes.PHONE, phone);
    if (isValid.error) {
        return res.status(400).json({ message: isValid.message });
    }

    const otpCode = otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        specialChars: false,
        lowerCaseAlphabets: false,
    });

    try {
        const user = await prisma.user.findFirst({
            where: { phone: phone },
        });

        if (!user) {
            return res.status(404).json({ message: 'This number is not registered yet' });
        }

        const newOtp = await prisma.otp.create({
            data: {
                userId: user.userId,
                code: otpCode,
            },
        });
        //send the otp on the phone
        const message = `DO NOT SHARE: Your ReturnJourney OTP is ${otpCode}\nThis is only valid for 10 mins\n`;
        await sendSMS(`91${phone}`, from, message);

        return res.status(201).json({ message: 'Otp sent to your phone' });
    } catch (error) {
        return res.status(500).json({ message: 'Internel Server Error' });
    }
};

export const resetPassVerify = async (req, res, next) => {
    const { phone, code } = req.body;

    if (!phone || !code) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    const isValid1 = validate(res, validateTypes.PHONE, phone);
    const isValid2 = validate(res, validateTypes.OTP, code);

    if (isValid1.error) {
        return res.status(400).json({ message: isValid1.message });
    }
    if (isValid2.error) {
        return res.status(400).json({ message: isValid2.message });
    }

    try {
        const currentTimestamp = new Date(); // Get current timestamp
        const gapTime = new Date(currentTimestamp.getTime() - 10 * 60 * 1000);

        const user = await prisma.user.findFirst({
            where: { phone: phone },
        });

        if (!user || !user.isActive) {
            return res.status(404).json({ message: 'This number is not registered yet' });
        }

        const otpRecord = await prisma.otp.findFirst({
            where: {
                userId: user.userId,
                code: code,
                expiry: {
                    gte: gapTime,
                },
            },
            include: {
                User: true, // Include the user information
            },
        });

        if (!otpRecord) {
            return res.status(404).json({ message: 'Invalid OTP' });
        }

        const token = jwt.sign(
            {
                phone: otpRecord.User.phone,
                userId: otpRecord.User.userId,
            },
            process.env.JWT_SECRET_RESET
        );

        return res.status(200).json({ message: 'Otp Verified', data: { token, uid: user.userId, phone: user.phone } });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return res.status(500).json({ message: 'Internal Server Error', error });
    }
};

export const resetPass = async (req, res, next) => {
    const { uid, password, confirm } = req.body;

    // All fields are required
    if (!(password && confirm)) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    // password and confirm password must be same
    if (password !== confirm) {
        return res.status(400).json({ message: 'Password not match' });
    }

    // minimum length must be 8
    if (password.length < 8) {
        return res.status(400).json({ message: 'minimum length should be 8' });
    }

    const result = await prisma.user.findUnique({
        where: {
            userId: uid,
        },
    });

    if (!result || !result.isActive) {
        return res.status(404).json({ message: 'User not found' });
    }

    try {
        const hassPass = await bcrypt.hash(password, 10);
        const user = await prisma.user.update({
            where: {
                userId: uid,
            },
            data: {
                password: hassPass,
            },
        });

        // we will send the otp on the mail

        return res.status(201).json({ message: 'Password Reset', user: { uid: user.userId, phone: user.phone } });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Internel Server Error' });
    }
};
