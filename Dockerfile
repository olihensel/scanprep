FROM node:14-stretch
WORKDIR /app
RUN apt-get install -y libpng-dev zlib1g-dev libjpeg-dev
COPY package*.json /app/
RUN npm install
COPY . /app/
CMD ["npm", "run", "start"]