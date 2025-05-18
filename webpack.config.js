//@ts-check

'use strict';

const path = require('path');
const copyPlugin = require("copy-webpack-plugin");

/**@type {import('webpack').Configuration}*/
const extensionConfig = {
   name: 'extension', // 给配置命名
   target: 'node',
   mode: 'none',
   entry: './src/extension.ts',
   output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2'
   },
   devtool: 'nosources-source-map',
   externals: {
      vscode: 'commonjs vscode'
   },
   resolve: {
      extensions: ['.ts', '.js']
   },
   module: {
      rules: [
         {
            test: /\.ts$/,
            exclude: /node_modules/,
            use: [
               {
                  loader: 'ts-loader'
               }
            ]
         }
      ]
   },
   plugins: [
      new copyPlugin({
         patterns: [
            {
               from: path.posix.join(path.resolve(__dirname, 'node_modules', 'trash', 'lib').replace(/\\/g, '/'), '*[!.js]'),
               to: path.resolve(__dirname, 'dist', '[name][ext]')
            }
         ],
         options: {
            concurrency: 50
         }
      })
   ]
};

/**@type {import('webpack').Configuration}*/
const webviewConfig = {
   name: 'webview', // 给配置命名
   target: 'web', // 目标环境为 web
   mode: 'none',
   entry: { // 为 webview 创建单独的入口
      chat: './media/chat.ts'
   },
   output: {
      path: path.resolve(__dirname, 'dist', 'media'), // 输出到 dist/media 文件夹
      filename: '[name].js' // 输出 chat.js
   },
   devtool: 'nosources-source-map',
   resolve: {
      extensions: ['.ts', '.js']
   },
   module: {
      rules: [
         {
            test: /\.ts$/,
            exclude: /node_modules/,
            use: [
               {
                  loader: 'ts-loader'
               }
            ]
         }
      ]
   }
};

module.exports = [extensionConfig, webviewConfig]; // 导出配置数组
