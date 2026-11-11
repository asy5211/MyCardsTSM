Install xcode from the app store (https://apps.apple.com/us/app/xcode/id497799835?mt=12)
The app will only compile if you are using a macbook, this is a swiftUI projet that is only supported by iOS
Install the latest macOS version
Install MySQL-8.0.46-macos15-x86_64.dmg (https://dev.mysql.com/downloads/mysql/8.0.html)
I am running this on a older macbook, to ensure that your matches please use the same versioning, if you have a more recent one uninstall it and try again using this one if you hit any errors
After the download finishes double click it and agree to all of the default settings on the MYSQL pop up to install it
Take note this is not a workbench and will work purely in the terminal, and you will need to create a 8 digit password for it
Install the zip file form my github for the tsc service - https://github.com/asy5211/MyCardsTSM
Next we will begin extracting the files in a way to prevent user error
Run the commands to extract it
cd ~/Downloads
unzip -q MyCardsTSM-main.zip
Run these commands to move it (change school to the directory of your choice)
mv ~/Downloads/MyCardsTSM-main ~/School
ls ~/School
Next verify what version you are on you need to see a v20 or higher, mine is v24.5.0
Run this command to see it
node -v
Now we will finish the mysql install with these commands
echo 'export PATH="/usr/local/mysql/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
mysql --version
Verify it was install correctly making sure you see You should see a line that includes Ver 8.0.46 and x86_64.
Verify it worked with the command (you will need the root password you set while downloading mysql from the dmg)
mysql -u root -p -e "SELECT VERSION();"
Now we will create all of the databases in mysql (change the directory to match where you moved it to mine is “School”
cd ~/School/db
mysql -u root -p < sql/00_create_database_and_user.sql
mysql -u root -p --default-character-set=utf8mb4 < sql/01_schema.sql
mysql -u root -p --default-character-set=utf8mb4 < sql/02_seed.sql
Note make sure you run each one individually as you will need your root password for each of them. Running them all at once will mess it up
mysql -u root -p --default-character-set=utf8mb4 -t < sql/03_verify.sql
This command will let you check to make sure they were all created correctly
Now we will start the servers so that the app can work (again change school to match where you put the files)
cd ~/School/backend
npm install
cp ../db/backend.env.example .env.example
npm run init-env
npm test
This last one is to verify it downloaded correctly
npm run dev
In a new terminal tab (without stopping the previous one)
curl localhost:4000/health
This will check the status of the server
We will now have the backend servers running now we need to set up the front end servers
In a new tab you can also use the tab you used to check the health of the server (don’t stop the backend or close it)
cd ~/School/admin
npm install
npm run dev
Now we can open the code/app (Change the school directory to match where you moved it)
open ~/School/mobile/MyCards440W.xcodeproj
You will need to click trust for this to open
After you open the code the build is likely to fail to build if you haven’t installed xcode before. This is expected as in the tool bar you will need to click get on the iOS 26.5 option. This will take a while to install, but it will be the simulator that runs that app. You will also need to sign into your apple account/developer account for the download to finish
After you finish that you will need to set up developer mode on your iPhone device
Then use a usb c cord to plug into your device and computer and click start download
After the download starts for the first time you will need to go to your iphones settings/general/vpn&device management and click trust on your developer account
To get the app to connect to the server sign in as a guest, and go to settings. Change to to connect to a live server. Double click on the server address and change it to match your real ip address
To find it run “ipconfig getifaddr en0” in the terminal and it will output your ip address
After you finish connecting it click test connection to verify it worked
To open the admin go to http://192.168.1.20:5173/login. The 192.168.1.20 needs to be changed to also match your ip address (same numbers you typed in the app, but instead of 4000 its going to be 5173 to end it)
