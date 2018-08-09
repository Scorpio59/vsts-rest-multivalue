var path = require("path");
var webpack = require("webpack");
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');
var CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    target: "web",
    entry: {
        registerMultiValue: "./src/registerMultiValue.ts"
    },
    output: {
        filename: "src/[name].js",
        libraryTarget: "amd"
    },
    externals: [
        {
            "q": true,
            "react": true,
            "react-dom": true
        },
        /^VSS\/.*/, /^TFS\/.*/, /^q$/
    ],
    node: {
        fs: "empty"
    },
    resolve: {
        extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"],
        moduleExtensions: ["-loader"],
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: "ts-loader"
            },
            {
                test: /\.s?css$/,
                use: ["style-loader", "css-loader"]
            }
        ]
    },
    mode: "development",
    plugins: [
        // new UglifyJSPlugin({
        //     compress: {
        //         warnings: false
        //     },
        //     output: {
        //         comments: false
        //     }
        // }),
        new CopyWebpackPlugin([
            { from: "./node_modules/vss-web-extension-sdk/lib/VSS.SDK.min.js", to: "libs/VSS.SDK.min.js" },
            { from: "./src/multivalue.html", to: "./" },
            { from: "./src/multi-selection.css", to: "./" },
            { from: "./img", to: "img" },
            { from: "./readme.md", to: "readme.md" }
        ])
    ],
    devtool: "sourcemap"
}