// const express = require('express');
// const app = express();
// const morgan = require('morgan');
// const bodyParser = require('body-parser');
// const cors = require('cors');

import express from 'express';
const app = express();
import morgan from 'morgan';
import bodyParser from 'body-parser';

// const mongoose = require('mongoose');
// mongoose.set('strictQuery', true);
// mongoose.connect(`mongodb+srv://${process.env.EMAIL}:${process.env.PASS}@cluster0.yfz8i.mongodb.net/ReturnJourney`);
//

// const productRouter = require('./api/routes/product');
// const orderRouter = require('./api/routes/orders');
import userRouter from './api/routes/user.js';

app.use(morgan('dev'));
app.use('/uploads', express.static('uploads'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// app.use((req, res, next) => {
//     res.header('Access-Control-Allow-Origin', '*');
//     res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization');
//     if (req.method === 'OPTIONS') {
//         res.header('Access-Control-Allow-Methods', 'PUT,POST,PATCH,DELETE,GET');
//         return res.status(200).json({});
//     }
// });

app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

// app.use(
//     cors({
//         origin: 'http://localhost:2000',
//     })
// );

// app.use('/products', productRouter);
// app.use('/orders', orderRouter);
app.use('/users', userRouter);

app.use((req, res, next) => {
    const error = new Error('Not Found');
    error.status = 404;
    next(error);
});

app.use((error, req, res, next) => {
    res.status(error.status || 500);
    res.json({
        error: {
            message: error.message,
        },
    });
});

export default app;
