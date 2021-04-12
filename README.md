# melit-build-war [buildwar]
Herramienta para crear WAR/JAR, se añaden funcionalidades para quitar cache a los archivos cuando se despliega en modo test/DEV.

## Instalar
```
> npm i -g melit-build-war
```

## Ejecutar:
```
> buildwar
```
## Argumentos
* --output(--o): Nombre del fichero generado

* --testSkip(--t): skip test, no necesita valor

* --profile(--p): Perfil de creación. [pro] o [dev], por defecto 'dev'
  
* --release(--r): Release version

* --silent(--s): Silent mode, no necesita valor

## Uso:
```
> buildwar --output=test.war --profile=dev
> buildwar --output=test2.jar
> buildwar --p=prod --testSkip 
> buildwar --t --release="1.0.0"
> buildwar --t --silent
```

## Requiere
* Microsoft PowerShell o Linux/Unix terminal
* npm > 5.6.0
* Maven
* Git

### Importante: No compatible con la Git Bash
