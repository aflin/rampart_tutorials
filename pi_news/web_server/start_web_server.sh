die() {
	echo $1
	exit 1
}

RP=`which rampart`;

if [ "$RP" == "" ]; then
	die "Cannot find rampart executable in your path"
fi

echo "Starting Web Server"

$RP ./web_server_conf.js

echo "Go to http://localhost:8089/ to view"