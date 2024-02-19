export default {
  database: {
    username: "myapp2",
    from_env: "${env:MYAPP_RECORD1}",
    items: [
      {
        object1: {
          record: "value 2",
        },
      },
      "value 3",
      process.env.NODE_ENV,
    ],
  },
};
