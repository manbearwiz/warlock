var EventEmitter = require( 'events' ).EventEmitter;
var PipelineManager = require ( './pipeline-manager' );
var TaskManager = require ( './task-manager' );
var ConfigManager = require ( './config-manager' );
var util = require( './utilities' );
var di = require( 'di' );
var fs = require( 'fs' );
var findup = require( 'findup-sync' );
var path = require( 'path' );

function Bootstrapper (
  /* TaskManager */ taskMgr,
  /* PipelineManager */ pipelineMgr,
  /* ConfigManager */ configMgr
) {
  Bootstrapper.super_.call( this );

  this._taskManager = taskMgr;
  this._pipelineManager = pipelineMgr;
  this._configManager = configMgr;
}
util.extend( Bootstrapper, EventEmitter );
di.annotate( Bootstrapper, new di.Inject( TaskManager ) );
di.annotate( Bootstrapper, new di.Inject( PipelineManager ) );
di.annotate( Bootstrapper, new di.Inject( ConfigManager ) );

Bootstrapper.prototype.engage = function () {
  var bootstrapper = this;

  bootstrapper.emit( 'start' );

  // Load up package.json
  var pkgfile = findup( 'package.json' );

  // NOTE(jdm): This is a hard branch to test because this package has a package.json file. If
  // someone has a clever way to test this, by all means. In the interim, let's omit it from code
  // coverage.
  /* istanbul ignore if  */
  if ( ! pkgfile ) {
    // It's required; handle error
    bootstrapper.emit( 'error', new Error( 'Could not locate package.json.' ) );
    return;
  }

  // Load up the package.json and merge its warlock key into the runtime config.
  bootstrapper.mergeConfigFromFile( path.resolve( pkgfile ), 'warlock' )

  // Then find the warlock file, if it exists, and merge it into the runtime config as well.
  .flatMap( function () {
    // Load up warlock.json
    var warlockfile = findup( 'warlock.json' );

    // If there is a warlock.json file, load it up to. Otherwise, move on.
    // NOTE(jdm): This is a hard branch to test because this package has a warlock.json file. If
    // someone has a clever way to test this, by all means. In the interim, let's omit it from code
    // coverage.
    /* istanbul ignore if  */
    if ( ! warlockfile ) {
      return util.stream([true]);
    } else {
      return bootstrapper.mergeConfigFromFile( path.resolve( warlockfile ) );
    }
  })

  // If there was an unexpected error anywhere in here, we're done. Emit an error.
  // NOTE(jdm): This is a hard branch to test because this is only meant to catch odd, unanticipated
  // errors. If someone has a clever way to test this, by all means. In the interim, let's omit it
  // from code coverage.
  .stopOnError( /* istanbul ignore next */ function ( err ) {
    bootstrapper.emit( 'error', err );
  })

  // Finally, let everything know we're done bootstrapping.
  .apply( function () {
    bootstrapper.emit( 'done' );
  });
};

Bootstrapper.prototype.createPipelineTasks = function () {
  var taskMgr = this._taskManager;

  this._pipelineManager.tasks().forEach( function ( task ) {
    taskMgr.add( task.name, task.depends, task.fn );
  });
};

Bootstrapper.prototype.mergeConfigFromFile = function ( path, root ) {
  var bootstrapper = this;

  return util.stream( fs.createReadStream( path ) )
    .flatMap( function ( buffer ) {
      return util.stream.fromJson( buffer.toString() );
    })
    .map( function ( obj ) {
      obj = root ? util.object.get( obj, root ) || {} : obj;
      bootstrapper._configManager.merge( obj );
      return obj;
    });
};

module.exports = Bootstrapper;