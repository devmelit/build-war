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
* output(o): Nombre del fichero generado

* skip-test(t): skip test, no necesita valor

* profile(p): Perfil de creación. [pro] o [dev]

## Uso:
```
> buildwar -o test.war -profile dev
> buildwar -p prod -skip-test 
```

## Requiere
* Microsoft PowerShell o Linux/Unix terminal
* npm > 5.6.0
* Maven
* Git

### Importante: No compatible con la Git Bash
