const validations = {
    phone: {
        // must start with +country_code and must be 10 digits, should have the format +country_code xxxxxxxxx
        // australia ph no takes 9 digit
        regex: /^[1-9][0-9]{9}$/,
        errorMsg: `Invalid phone number`,
        maxLength: 10,
    },
    otp: {
        // must be 6 digits
        regex: /^[0-9]{6}$/,
        errorMsg: 'Otp must be 6 digits',
    },
};

export const validateTypes = {
    PHONE: 'phone',
    OTP: 'otp',
};

// if you just want to check max length, then provide all 4 params
// if you want to check regex, then provide the first 3 params
export const validate = (res, type, value, maxLength) => {
    if (maxLength) {
        if (value.length > maxLength) {
            // return res.status(400).json({ message: `${type} cannot be more than ${maxLength} characters` });
            return {
                error: true,
                message: `${type} cannot be more than ${maxLength} characters`,
            };
        }
    } else if (validations[type]) {
        const { regex, errorMsg, maxLength } = validations[type];
        if (maxLength && value.length > maxLength) {
            // return res.status(400).json({ message: `${type} cannot be more than ${maxLength} characters` });
            return {
                error: true,
                message: `${type} cannot be more than ${maxLength} characters`,
            };
        }
        if (!regex.test(value)) {
            // return res.status(400).json({ message: errorMsg });
            return {
                error: true,
                message: errorMsg,
            };
        }
    }

    return {
        error: false,
        message: '',
    };
};

export default validations;
