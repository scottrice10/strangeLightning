angular.module('thesisApp')
  .directive('threeWorld', function($rootScope) {
    return {
      restrict: 'E',
      controller: ['$scope', 'catalogFactory', 'modelData', function($scope, catalogFactory, modelData) {
        $scope.catalogFactory = catalogFactory;
        $scope.modelData = modelData;

        // Do range query to find 100 products with nearest x, y, z coordinates to camera
        $scope.doCoordinatesSearch = function(coordinatesObject, modelMap) {
          var coordinateFilters = [];
          for(var key in coordinatesObject) {
            coordinateFilters.push({
              term: key,
              value: coordinatesObject[key]
            });
          }

          $scope.catalogFactory.doSearch('', 0, coordinateFilters, 100, false)
            .success(function(results) {
              var products = results.data.results;
              for(var j = 0; j < products.length; j++) {
                var product = products[j];
                $scope.createObject(modelMap, product);
              }
            })
            .error(function(err) {
              console.log(err);
            });
        };

        // enable / disable moving in the 3D environment
        $scope.freeze3Dcontrols = function(){
          $scope.controls.enabled = false;
        };

        $scope.enable3Dcontrols = function(){
          $scope.controls.enabled = true;
        };
      }],
      link: function(scope) {
        var raycaster;
        var mouse = new THREE.Vector2();

        var clock = new THREE.Clock();

        var container;
        var camera, scene, renderer;
        var waterNormals;

        var WATER_WIDTH = 1000000;

        var parameters = {
          width: 2000,
          height: 2000,
          widthSegments: 250,
          heightSegments: 250,
          depth: 1500,
          param: 4,
          filterparam: 1
        };

        init();
        animate();

        function init() {

          /******************************************/
          /*         Window, renderer, scene        */
          /******************************************/

          container = document.createElement('div');
          container.id = 'three-world';
          document.body.appendChild(container);
          renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
          renderer.setPixelRatio(window.devicePixelRatio);
          renderer.setSize(window.innerWidth, window.innerHeight);
          // Show shadows
          renderer.shadowMapEnabled = true;

          renderer.domElement.addEventListener('mousedown', onDocumentMouseDown, false);
          renderer.domElement.addEventListener('mouseenter', scope.enable3Dcontrols, false);
          renderer.domElement.addEventListener('mouseleave', scope.freeze3Dcontrols, false);

          scene = new THREE.Scene();

          container.appendChild(renderer.domElement);

          // Set cursor as crosshair
          container.style.cursor = 'crosshair';

          /******************************************/
          /*            Camera controls             */
          /******************************************/

          camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 3000000);
          camera.position.set(2000, 750, 2000);

          scope.controls = new THREE.FirstPersonControls(camera, renderer.domElement);
          scope.controls.movementSpeed = 30000;
          scope.controls.lookSpeed = 0.1;

          /******************************************/
          /*               Raycaster                */
          /******************************************/

          // Used to select objects on the screen
          raycaster = new THREE.Raycaster();

          /******************************************/
          /*               SpotLight                */
          /******************************************/

          var spotLight = new THREE.SpotLight(0xffffff);
          spotLight.position.set(-100000, 900000, 110000);

          // Show shadows, and show light source
          spotLight.castShadow = true;
          spotLight.shadowCameraVisible = false;

          // Resolution of shadows
          spotLight.shadowMapWidth = 4096;
          spotLight.shadowMapHeight = 4096;

          // Where shadow starts and ends
          spotLight.shadowCameraNear = 1500;
          spotLight.shadowCameraFar = 1000000;

          // Defines how focused the light is
          spotLight.shadowCameraFov = 300;

          scene.add(spotLight);

          /******************************************/
          /*               Hemisphere               */
          /******************************************/

          var light = new THREE.HemisphereLight(0xffffbb, 0x080820, 1);
          light.position.set(-1, WATER_WIDTH, -1);

          light.shadowCameraVisible = true;

          scene.add(light);

          /******************************************/
          /*             Water surface              */
          /******************************************/

          waterNormals = new THREE.ImageUtils.loadTexture('assets/images/waternormals.jpg');
          waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

          // Set the water texture and calculate according to the camera position
          water = new THREE.Water(renderer, camera, scene, {
            textureWidth: 256,
            textureHeight: 256,
            waterNormals: waterNormals,
            alpha: 1.0,
            sunDirection: light.position.clone().normalize(),
            sunColor: 0xffffff,
            waterColor: 0x001e0f,
            distortionScale: 50.0
          });

          waterMesh = new THREE.Mesh(
            new THREE.PlaneBufferGeometry(parameters.width * 500, parameters.height * 500),
            water.material
          );

          waterMesh.add(water);
          waterMesh.rotation.x = -Math.PI * 0.5;

          waterMesh.name = "waterMesh";

          scene.add(waterMesh);

          /******************************************/
          /*    Skybox / surrounding environment    */
          /******************************************/

          var cubeMap = new THREE.CubeTexture([]);
          cubeMap.format = THREE.RGBFormat;
          cubeMap.flipY = false;

          var loader = new THREE.ImageLoader();
          loader.load('assets/images/sky.jpg', function(image) {

            var getSide = function(x, y) {

              var size = 1024;

              var canvas = document.createElement('canvas');
              canvas.width = size;
              canvas.height = size;

              var context = canvas.getContext('2d');
              context.drawImage(image, -x * size, -y * size);

              return canvas;

            };
            cubeMap.images[0] = getSide(2, 1); // px
            cubeMap.images[1] = getSide(0, 1); // nx
            cubeMap.images[2] = getSide(1, 0); // py
            cubeMap.images[3] = getSide(1, 2); // ny
            cubeMap.images[4] = getSide(1, 1); // pz
            cubeMap.images[5] = getSide(3, 1); // nz
            cubeMap.needsUpdate = true;

          });

          var cubeShader = THREE.ShaderLib['cube'];
          cubeShader.uniforms['tCube'].value = cubeMap;

          var skyBoxMaterial = new THREE.ShaderMaterial({
            fragmentShader: cubeShader.fragmentShader,
            vertexShader: cubeShader.vertexShader,
            uniforms: cubeShader.uniforms,
            depthWrite: false,
            side: THREE.BackSide
          });

          var skyBox = new THREE.Mesh(
            new THREE.BoxGeometry(WATER_WIDTH, WATER_WIDTH, WATER_WIDTH), skyBoxMaterial
          );

          skyBox.position.y += WATER_WIDTH / 2;
          skyBox.name = "skyBox";

          scene.add(skyBox);

          /******************************************/
          /*                Products                */
          /******************************************/

          // use model data to get modelToCategoryMap.json
          scope.modelData.get({}, function(modelMap) {
            var coordinatesObject = {
              x: '[-1000000,1000000]',
              y: '[-1000000,1000000]',
              z: '[-1000000,1000000]'
            };

            // Add multiple objects from cloudsearch product index
            scope.doCoordinatesSearch(coordinatesObject, modelMap);
          });
        }

        var colorTexture = ['blue', 'green', 'pink', 'red', 'yellow'];

        // create product 3D object
        scope.createObject = function(modelMap, product) {
          // load correct model based on product's category
          var loader = new THREE.OBJLoader();
          loader.load('assets/models/' + modelMap[product.category] + '.obj', function(object) {

            var objTexture = new THREE.Texture();
            var imgLoader = new THREE.ImageLoader();

            var idxCol = Math.floor( Math.random() * colorTexture.length );
            imgLoader.load( 'assets/images/' + colorTexture[idxCol] + 'Texture.jpg', function (image) {
              objTexture.image = image;
              objTexture.needsUpdate = true;
            });

            object.traverse(function(child) {
              if(child instanceof THREE.Mesh) {
                child.material.map = objTexture;
                child.material.side = THREE.DoubleSide;
                child.castShadow = true;
                child.receiveShadow = true;
                // child.material.wireframe = true;
                // child.material.overdraw = 0.5;
              }
            });

            // Position each object according to the graph functions
            object.position.x = product.x - 300000;
            object.position.y = product.y * 0.5 - 50000;
            object.position.z = product.z - 300000;

            // Rotate randomly each object
            object.rotation.x = degInRad(Math.random() * 90);
            object.rotation.y = degInRad(Math.random() * 90);
            object.rotation.z = degInRad(Math.random() * 90);

            // Increase the scale of the object by 500x
            object.scale.set(500, 500, 500);

            object.castShadow = true;
            object.receiveShadow = true;

            // add item to object
            object.name = "";
            object.product = product;

            // Add each item in scene
            scene.add(object);
          })
        };

        // handles resizing the renderer when the window is resized
        window.addEventListener('resize', onWindowResize, false);

        // Resize image when window is resized
        function onWindowResize() {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
        }

        // Clicking on objects creates a ray between cursor and perpendicular back-plane
        function onDocumentMouseDown(event) {

          event.preventDefault();

          var vector = new THREE.Vector3(mouse.x, mouse.y, 0.5).unproject(camera);
          // Set the raycaster
          var raycaster = new THREE.Raycaster(camera.position, vector.sub(camera.position).normalize());
          var intersects = raycaster.intersectObjects(scene.children, true);

          // Get the first object from the 'intersects' array
          var selected = intersects[0].object;

          if(intersects.length > 0 && selected.name === "") {
            scope.showcaseProduct(selected.parent.product);
          }
        }

        function animate() {
          requestAnimationFrame(animate);
          render();
        }

        /******************************************/
        /*               Render scene             */
        /******************************************/

        function render() {
          water.material.uniforms.time.value += 1.0 / 60.0;
          water.render();

          // Bounding box for navigation in all axes
          if(scope.controls.object.position.y > 80000) {

            scope.controls.moveForward = false;
            scope.controls.moveBackward = false;
            scope.controls.object.position.y -= 50;

          } else if(scope.controls.object.position.y < 100) {

            scope.controls.moveForward = false;
            scope.controls.moveBackward = false;
            scope.controls.object.position.y += 2;

          } else if(scope.controls.object.position.x > (WATER_WIDTH / 2 - 300000)) {

            scope.controls.moveForward = false;
            scope.controls.moveBackward = false;
            scope.controls.object.position.x -= 100;

          } else if(scope.controls.object.position.x < -(WATER_WIDTH / 2 - 300000)) {

            scope.controls.moveForward = false;
            scope.controls.moveBackward = false;
            scope.controls.object.position.x += 100;

          } else if(scope.controls.object.position.z > (WATER_WIDTH / 2 - 300000)) {

            scope.controls.moveForward = false;
            scope.controls.moveBackward = false;
            scope.controls.object.position.z -= 100;

          } else if(scope.controls.object.position.z < -(WATER_WIDTH / 2 - 300000)) {

            scope.controls.moveForward = false;
            scope.controls.moveBackward = false;
            scope.controls.object.position.z += 100;

          }

          scope.controls.update(clock.getDelta());
          renderer.render(scene, camera);
        }

        // Convert radiant into degrees
        function degInRad(deg) {
          return deg * Math.PI / 180;
        }

        // hide the showcase by default
        $('.showcase-container').css('margin-right', '-1000px');

        scope.showcaseProduct = function(product) {
          $rootScope.$broadcast('showcaseProduct', product);
          scope.$apply();
        };
      }
    };
  });
