FROM node:11

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY . .

RUN yarn install
RUN yarn build

EXPOSE 8545
CMD [ "npm", "start" ]