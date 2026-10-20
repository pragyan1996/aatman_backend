export default (schemas) => (req, res, next) => {
    const validated = {};
    const errors = [];

    for (const location of ['body', 'query', 'params']) {
        const schema = schemas[location];
        if (!schema) continue;
        
        const { error, value } = schema.validate(req[location], {
            abortEarly: false,
            allowUnknown: false,
            convert: true
        });

        if (error) {
            errors.push(
                ...error.details.map((detail) => ({
                    location,
                    field: detail.path.join('.'),
                    message: detail.message
                }))
            )
        } else {
            validated[location] = value;
        }
    }
    if (errors.length > 0) {
        return res.status(400).json({
            message: "Validation failed, wrong payload",
            errors: errors
        });
    }
    req.validated = validated;
    next();
}