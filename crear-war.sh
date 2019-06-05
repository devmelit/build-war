#!/bin/sh
#
# By LDroid
# 0.5.9 2019-03-07
##################
dir_ini=`pwd`;
dir_app_constants='src/main/webapp/app/';
dir_index='src/main/webapp/';
project_name='myicabs';
war_name='pt#myicabs';

#Buscamos en el pom.xml la version actual.
old_version=`sed '1,/<artifactId>'$project_name'/d;/<packaging>/,$d' < pom.xml | sed 's/\s*<version>//g' | sed 's/<\/version>//'`;

#Producción o Desarrollo
read -e -p '¿Es war de Producción? [y/n]: ' -i 'n' produccion;

perfil="";
if [ $produccion == "y" ]; then
	perfil="-Pprod";
fi;

#pedir la version del war al usuario
read -e -p 'Introduzca NUEVA VERSION: ' -i $old_version version;

cadenaBuscar="<version>$old_version</version>";
cadenaSustituta="<version>$version</version>";

#Cambiamos la version en el pom.xml
sed -i -e 's%'$cadenaBuscar'%'$cadenaSustituta'%' pom.xml

cd $dir_app_constants;

date=`date +%Y-%m-%d`;
#Cambiamos la version app.constant.js
sed -i -e "s/constant('VERSION', '.*')/constant('VERSION', '"$version"')/g" app.constants.js
sed -i -e "s/constant('VERSION_DATE', '.*')/constant('VERSION_DATE', '"$date"')/g" app.constants.js

cd $dir_ini;

if [ $produccion != "y" ]; then
	read -e -p "¿Desea quitar cache? [y/n]: " -i "y" quitarCache;
	if [ $quitarCache == "y" ]; then

		cd $dir_index;
		continuar=true;
		while $continuar; do
			continuar=false;
			echo "HELP: Introduzca el directorio de los script. Ex: 'midir/'.";
			echo "Ex: 'oferta/': añadirá a todos los archivos que **oferta/**.js?123456789";
			read pattern;
			sed -i 's#\b'$pattern'.*\.js\b#&?'`date +%s`'#' index.html;
			sed -i 's#\b'$pattern'.*\.html\b#&?'`date +%s`'#' `find ./ -name $pattern.state.js -or -name $pattern.js -type f`;
			
			read -e -p 'Quiere continuar quitando cache? [y/n]: ' -i 'n' quiereContinuar;

			if [ $quiereContinuar == "y" ]; then		
				continuar=true;
			fi;
		done;
	fi;
fi;

cd $dir_ini;

if mvn clean && mvn package $perfil ; then
   	echo "mvn package OK!";
else
   echo "Something went wrong.";
   echo '[ENTER] para salir';
   git checkout -- $dir_index/index.html;
   read salir;
   exit 1;
fi

mv target/*.war target/$war_name-spring-boot.war;
mv target/*.war.original target/$war_name.war;

git checkout -- $dir_index/index.html;

echo '[ENTER] para salir';
read salir;